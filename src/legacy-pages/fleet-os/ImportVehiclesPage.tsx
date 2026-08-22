import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@packages/auth";
import { FleetOSLayout } from "@/components/layout/FleetOSLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VehicleImportLanding } from "@/components/fleet/vehicle-import/VehicleImportLanding";
import { VehicleImportJobSetup } from "@/components/fleet/vehicle-import/VehicleImportJobSetup";
import { VehicleImportWorkOrders } from "@/components/fleet/vehicle-import/VehicleImportWorkOrders";
import { VehicleImportMapping } from "@/components/fleet/vehicle-import/VehicleImportMapping";
import { VehicleImportProcessing } from "@/components/fleet/vehicle-import/VehicleImportProcessing";
import { VehicleImportReview } from "@/components/fleet/vehicle-import/VehicleImportReview";
import { VehicleImportResults } from "@/components/fleet/vehicle-import/VehicleImportResults";
import { useVehicleImportWorkflow } from "@/features/vehicle-import/useVehicleImportWorkflow";
import { listImportHistory } from "@/features/vehicle-import/services/staging-persistence.service";

const rolesAllowedToImport = new Set(["admin", "provider_owner", "dispatcher", "ops_manager", "fleet_manager"]);

const inferUserRole = (user: { user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> } | null): string => {
  const metadataRole = user?.app_metadata?.role || user?.user_metadata?.role;
  return typeof metadataRole === "string" ? metadataRole : "provider_owner";
};

export default function ImportVehiclesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const workflow = useVehicleImportWorkflow(user?.id);
  const [history, setHistory] = useState<Array<{
    id: string;
    sourceFileName: string;
    status: string;
    totalRows: number;
    committedRows: number;
    createdAt: string;
  }>>([]);
  const resumedBatchRef = useRef<string | null>(null);
  const inferredRole = inferUserRole(user);
  const canCommit = rolesAllowedToImport.has(inferredRole);

  const timeline = useMemo(
    () => [
      { id: "landing", label: "Upload" },
      { id: "setup", label: "Job Setup" },
      { id: "mapping", label: "Mapping" },
      { id: "processing", label: "Decode + Validate" },
      { id: "review", label: "Review" },
      { id: "results", label: "Commit Results" },
      { id: "work_orders", label: "Work Orders" },
    ],
    []
  );

  const resumeBatchId = searchParams.get("batch");
  const initialClientId = searchParams.get("clientId");

  useEffect(() => {
    if (!resumeBatchId) return;
    if (resumedBatchRef.current === resumeBatchId) return;
    resumedBatchRef.current = resumeBatchId;
    void workflow.resumeBatch(resumeBatchId);
  }, [resumeBatchId, workflow]);

  useEffect(() => {
    if (!user?.id) return;
    void listImportHistory(user.id).then((rows) => {
      setHistory([...rows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10));
    });
  }, [user?.id, workflow.step]);

  return (
    <FleetOSLayout title="Import Vehicles">
      <div className="space-y-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Import Vehicles</h2>
            <p className="text-sm text-muted-foreground">Fleet onboarding pipeline with VIN intelligence, duplicate controls, and audit-grade outcomes.</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={canCommit ? "default" : "destructive"}>{inferredRole}</Badge>
            <Button variant="outline" onClick={() => navigate("/fleet-os/vehicles")}>Back to vehicles</Button>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-3">
          <div className="grid gap-2 md:grid-cols-4 xl:grid-cols-7">
            {timeline.map((step, index) => {
              const active = workflow.step === step.id;
              return (
                <div key={step.id} className={`rounded border px-3 py-2 text-sm ${active ? "border-emerald-500 bg-emerald-500/10" : "border-border"}`}>
                  <p className="text-xs text-muted-foreground">Step {index + 1}</p>
                  <p className="font-medium">{step.label}</p>
                </div>
              );
            })}
          </div>
        </div>

        {workflow.step === "landing" && (
          <VehicleImportLanding
            onFileSelected={async (file) => {
              console.info("vehicle_import_started", { source: "file", fileName: file.name });
              await workflow.loadFile(file, user?.id || "unknown-user");
            }}
            onPasteImported={(input) => {
              console.info("vehicle_import_started", { source: "paste", chars: input.length });
              void workflow.loadPaste(input, user?.id || "unknown-user");
            }}
          />
        )}

        {workflow.step === "setup" && workflow.batch && (
          <VehicleImportJobSetup
            batch={workflow.batch}
            initialClientId={initialClientId}
            onBack={() => workflow.setStep("landing")}
            onContinue={(setup) => workflow.applyJobSetupStep(setup)}
          />
        )}

        {workflow.step === "mapping" && workflow.batch && (
          <VehicleImportMapping
            batch={workflow.batch}
            onChange={(mapping) => workflow.applyMapping(mapping)}
            onContinue={async () => {
              console.info("vehicle_import_mapping_completed", { mappedColumns: workflow.batch?.mapping.length || 0 });
              await workflow.processSession();
            }}
          />
        )}

        {workflow.step === "processing" && <VehicleImportProcessing progress={workflow.processingProgress} />}

        {workflow.step === "review" && workflow.batch && (
          <VehicleImportReview
            batch={workflow.batch}
            rows={workflow.rows}
            onRowSkip={workflow.setRowSkip}
            onRowOverride={workflow.setRowOverride}
            onRowDecode={workflow.decodeRow}
            decodingRowIds={workflow.decodingRowIds}
            onBulkApproveReady={() => workflow.bulkApproveByStatus(["needs_review"])}

            onRevalidate={async () => {
              await workflow.processSession();
            }}
            onCommit={async () => {
              if (!canCommit) return;
              console.info("vehicle_import_commit_started", { batchId: workflow.batch?.id });
              await workflow.commit();
              console.info("vehicle_import_commit_completed", { batchId: workflow.batch?.id, summary: workflow.summary });
            }}
          />
        )}

        {workflow.step === "results" && workflow.batch && (
          <VehicleImportResults
            batch={workflow.batch}
            rows={workflow.rows}
            summary={workflow.summary}
            onStartOver={() => window.location.reload()}
            onCreateWorkOrders={workflow.summary.importedSuccessfully > 0 ? () => workflow.setStep("work_orders") : undefined}
          />
        )}

        {workflow.step === "work_orders" && workflow.batch && (
          <VehicleImportWorkOrders
            batch={workflow.batch}
            rows={workflow.rows}
            jobSetup={workflow.jobSetup}
            result={workflow.workOrderResult}
            loading={workflow.loading}
            onCreate={(vehicleIds) => void workflow.createWorkOrders(vehicleIds)}
            onSkip={() => workflow.setStep("results")}
            onOpenWorkOrders={() => navigate("/fleet-os/work-orders")}
          />
        )}

        {workflow.loading && (
          <p className="text-xs text-muted-foreground">Processing import pipeline...</p>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Import History</CardTitle>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No import batches found yet.</p>
            ) : (
              <div className="space-y-2">
                {history.map((batch) => (
                  <div key={batch.id} className="flex items-center justify-between rounded border p-2 text-sm">
                    <div>
                      <p className="font-medium">{batch.sourceFileName || "manual-paste"}</p>
                      <p className="text-xs text-muted-foreground">{new Date(batch.createdAt).toLocaleString()} • {batch.committedRows}/{batch.totalRows} imported</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{batch.status}</Badge>
                      <Button size="sm" variant="outline" onClick={() => navigate(`/fleet-os/vehicles/import?batch=${batch.id}`)}>Open</Button>
                      {batch.status === "committed" && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={async () => {
                            const result = await workflow.rollbackBatch(batch.id);
                            console.info("vehicle_import_rollback_completed", { batchId: batch.id, ...result });
                            const rows = await listImportHistory(user?.id || "");
                            setHistory([...rows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10));
                          }}
                        >
                          Rollback
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </FleetOSLayout>
  );
}

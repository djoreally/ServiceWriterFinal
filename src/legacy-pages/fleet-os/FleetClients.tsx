/**
 * FleetClients — fleet account directory (visual redesign).
 *
 * Cognitive-load design: one plain-language context line, local search, rows
 * that answer "who is this account and what's open on it" at a glance.
 * Status color comes from the canonical semantic registry; money and counts
 * render in mono. Data logic unchanged.
 */
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { FleetOSLayout } from "@/components/layout/FleetOSLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchFleetClients, type FleetClientSummary } from "@/application/queries";
import { Building2, Plus, Phone, Mail, ChevronRight, Upload, Search } from "lucide-react";
import { FleetImportDialog } from "@/components/fleet/FleetImportDialog";
import { useAuth } from "@packages/auth";
import {
  validateClientRows,
  importFleetClients,
  CLIENT_IMPORT_COLUMNS,
} from "@/application/commands/fleet-import.command";
import {
  FleetIntro,
  FleetStatusPill,
  FleetListSkeleton,
  FleetError,
} from "@/components/fleet/FleetViewPrimitives";

const paymentTermsLabel: Record<string, string> = {
  due_on_receipt: "Due on Receipt",
  net_15: "Net 15",
  net_30: "Net 30",
  net_45: "Net 45",
  net_60: "Net 60",
};

const FleetClients = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [clients, setClients] = useState<FleetClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [search, setSearch] = useState("");

  const loadClients = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await fetchFleetClients();
      setClients(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const q = search.trim().toLowerCase();
  const visibleClients = q
    ? clients.filter(
        (c) =>
          c.company_name.toLowerCase().includes(q) ||
          c.phone?.toLowerCase().includes(q) ||
          c.billing_email?.toLowerCase().includes(q),
      )
    : clients;

  return (
    <FleetOSLayout title="Fleet Clients">
      <div className="space-y-5">
        <FleetIntro
          eyebrow="Fleet accounts"
          description="Every fleet you service — who they are, how they pay, and how much work is open on each one."
          actions={
            <>
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4 mr-1" /> Import CSV
              </Button>
              <Button size="sm" onClick={() => navigate("/fleet-os/clients/new")}>
                <Plus className="h-4 w-4 mr-1" /> Add Client
              </Button>
            </>
          }
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, phone, or billing email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-9"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono text-foreground">{visibleClients.length}</span>{" "}
            account{visibleClients.length !== 1 ? "s" : ""}
            {q && (
              <span className="text-muted-foreground">
                {" "}
                of <span className="font-mono">{clients.length}</span>
              </span>
            )}
          </p>
        </div>

        {loading ? (
          <FleetListSkeleton rows={5} />
        ) : error ? (
          <FleetError
            title="Couldn't load your fleet clients"
            message="Check your connection and try again. Your client data is safe."
            onRetry={loadClients}
          />
        ) : visibleClients.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-lg font-semibold">No fleet clients yet</p>
              <p className="text-sm leading-6 text-muted-foreground mt-1 mb-4">
                {q
                  ? "Nothing matches that search. Try a different name or clear it."
                  : "Add your first fleet client to start scheduling their vehicles."}
              </p>
              {!q && (
                <Button size="sm" onClick={() => navigate("/fleet-os/clients/new")}>
                  <Plus className="h-4 w-4 mr-1" /> Add Client
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-2">
            {visibleClients.map((client) => {
              const vehicleCount = client.fleet_vehicles?.length ?? 0;
              const workOrderCount = client.fleet_work_orders?.length ?? 0;
              return (
                <Card
                  key={client.id}
                  className="cursor-pointer transition-colors hover:border-primary/40"
                  onClick={() => navigate(`/fleet-os/clients/${client.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                          </span>
                          <p className="truncate text-base font-semibold">{client.company_name}</p>
                          <FleetStatusPill domain="customerLifecycle" status={client.status} />
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 pl-[46px] text-sm text-muted-foreground">
                          {client.phone && (
                            <span className="flex items-center gap-1.5">
                              <Phone className="h-3.5 w-3.5" />
                              <span className="font-mono text-[13px]">{client.phone}</span>
                            </span>
                          )}
                          {client.billing_email && (
                            <span className="flex items-center gap-1.5">
                              <Mail className="h-3.5 w-3.5" /> {client.billing_email}
                            </span>
                          )}
                          <span>{paymentTermsLabel[client.payment_terms] || client.payment_terms}</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-5">
                        <div className="hidden text-right sm:block">
                          <p className="font-mono text-sm font-medium text-foreground">
                            {vehicleCount}
                            <span className="ml-1.5 font-sans text-xs font-normal text-muted-foreground">
                              vehicle{vehicleCount !== 1 ? "s" : ""}
                            </span>
                          </p>
                          <p className="mt-0.5 font-mono text-sm font-medium text-foreground">
                            {workOrderCount}
                            <span className="ml-1.5 font-sans text-xs font-normal text-muted-foreground">
                              work order{workOrderCount !== 1 ? "s" : ""}
                            </span>
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Import dialog */}
      <FleetImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import Fleet Clients"
        description="Upload a CSV or Excel file to bulk-import fleet clients. Download the template for the expected format."
        templateColumns={CLIENT_IMPORT_COLUMNS}
        templateFileName="fleet-clients-template.csv"
        onValidate={(rows) => validateClientRows(rows)}
        onImport={(validRows) => importFleetClients(user!.id, validRows)}
        onComplete={loadClients}
      />
    </FleetOSLayout>
  );
};

export default FleetClients;

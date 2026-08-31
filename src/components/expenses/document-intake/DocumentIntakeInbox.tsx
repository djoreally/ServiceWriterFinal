import { useEffect, useState, useMemo, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2, XCircle, Clock, AlertCircle, FileText, Eye, RefreshCw,
  Trash2, Wrench, Fuel, Receipt, Car,
} from "lucide-react";
import {
  fetchIntakeDocuments,
  triggerDocumentParse,
  rejectIntakeDocument,
  softDeleteIntakeDocument,
  approveAndPromoteIntakeDocument,
  getIntakeFileSignedUrl,
  type DocumentIntakeRow,
  type IntakeProfile,
  type IntakeReviewStatus,
} from "@/application/queries/document-intake.query";
import { useAuth } from "@packages/auth";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface Props {
  refreshKey: number;
  onChanged: () => void;
}

const PROFILE_META: Record<IntakeProfile, { label: string; icon: typeof Wrench; tone: string }> = {
  service: { label: "Service", icon: Wrench, tone: "text-blue-500" },
  fuel: { label: "Fuel", icon: Fuel, tone: "text-amber-500" },
  general: { label: "General", icon: Receipt, tone: "text-muted-foreground" },
};

const STATUS_FILTERS: Array<{ key: IntakeReviewStatus | "all"; label: string }> = [
  { key: "pending_review", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

export function DocumentIntakeInbox({ refreshKey, onChanged }: Props) {
  const { session } = useAuth();
  const [docs, setDocs] = useState<DocumentIntakeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<IntakeReviewStatus | "all">("pending_review");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [signedFile, setSignedFile] = useState<{ path: string; url: string } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    await Promise.resolve();
    setLoading(true);
    const user = session?.user;
    if (!user) { setLoading(false); return; }
    try {
      const rows = await fetchIntakeDocuments(
        user.id,
        filter === "all" ? undefined : { reviewStatus: filter as IntakeReviewStatus },
      );
      setDocs(rows);
      if (selectedId && !rows.find((r) => r.id === selectedId)) setSelectedId(null);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load documents.");
    } finally {
      setLoading(false);
    }
  }, [filter, selectedId, session?.user]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [filter, load, refreshKey]);

  useEffect(() => {
    const hasParsing = docs.some((d) => d.parse_status === "pending" || d.parse_status === "parsing");
    if (!hasParsing) return;
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [docs, load]);

  const selected = useMemo(() => docs.find((d) => d.id === selectedId) ?? null, [docs, selectedId]);
  const signedUrl = selected && signedFile?.path === selected.file_path ? signedFile.url : null;

  useEffect(() => {
    if (!selected) return;
    const path = selected.file_path;
    getIntakeFileSignedUrl(path)
      .then((url) => setSignedFile({ path, url }))
      .catch(() => setSignedFile(null));
  }, [selected]);

  const handleReparse = async (id: string) => {
    setActionBusy(true);
    try {
      await triggerDocumentParse(id);
      toast.success("Parsed.");
      await load();
      onChanged();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Parse failed.");
    } finally {
      setActionBusy(false);
    }
  };

  const handleApprove = async (doc: DocumentIntakeRow) => {
    if (doc.parse_status !== "parsed") {
      toast.error("Document hasn't been parsed yet.");
      return;
    }
    const user = session?.user;
    if (!user) return;
    setActionBusy(true);
    try {
      const r = await approveAndPromoteIntakeDocument(doc, user.id);
      const what = r.fuelLogId ? "Fuel log" : "Expense";
      toast.success(`${what} created from document.`);
      await load();
      onChanged();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Approve failed.");
    } finally {
      setActionBusy(false);
    }
  };

  const handleReject = async (id: string) => {
    const reason = prompt("Reason for rejection?") ?? "";
    if (!reason.trim()) return;
    setActionBusy(true);
    try {
      await rejectIntakeDocument(id, reason.trim());
      toast.success("Rejected.");
      await load();
      onChanged();
    } catch (e) {
      console.error(e);
      toast.error("Reject failed.");
    } finally {
      setActionBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this document?")) return;
    setActionBusy(true);
    try {
      await softDeleteIntakeDocument(id);
      toast.success("Deleted.");
      await load();
      onChanged();
    } catch (e) {
      console.error(e);
      toast.error("Delete failed.");
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      <div className="lg:col-span-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 flex-wrap">
            {STATUS_FILTERS.map((f) => (
              <Button
                key={f.key}
                size="sm"
                variant={filter === f.key ? "default" : "ghost"}
                onClick={() => setFilter(f.key)}
                className="h-7 px-3 text-xs"
              >
                {f.label}
              </Button>
            ))}
          </div>
          <Button size="sm" variant="ghost" onClick={load} className="h-7 gap-1">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}
          </div>
        ) : docs.length === 0 ? (
          <Card className="border-border/60">
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              No documents in this view.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {docs.map((d) => {
              const ProfileIcon = PROFILE_META[d.profile].icon;
              const isSelected = d.id === selectedId;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setSelectedId(d.id)}
                  className={cn(
                    "w-full text-left rounded-lg border p-3 transition-colors",
                    isSelected ? "border-primary bg-primary/5" : "border-border/60 hover:border-border bg-card",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="size-9 rounded-md bg-muted flex items-center justify-center shrink-0">
                      <ProfileIcon className={cn("h-4 w-4", PROFILE_META[d.profile].tone)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{d.file_name}</p>
                        <ParseStatusBadge status={d.parse_status} />
                        <ReviewStatusBadge status={d.review_status} />
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                        <span>{format(new Date(d.created_at), "MMM d, h:mm a")}</span>
                        {d.confidence !== null && (
                          <span className={cn(
                            "tabular-nums",
                            d.confidence >= 0.85 ? "text-emerald-500" : d.confidence >= 0.6 ? "text-amber-500" : "text-destructive",
                          )}>
                            {Math.round(d.confidence * 100)}% conf.
                          </span>
                        )}
                        {d.extracted_vin && (
                          <span className="flex items-center gap-1">
                            <Car className="h-3 w-3" />
                            <span className="font-mono">{d.extracted_vin}</span>
                            {d.vin_valid === false && <AlertCircle className="h-3 w-3 text-destructive" />}
                          </span>
                        )}
                        {d.fleet_vehicle_id && (
                          <Badge variant="outline" className="h-4 px-1 text-[10px]">linked</Badge>
                        )}
                      </div>
                      {d.parse_error && (
                        <p className="text-[11px] text-destructive mt-1 truncate">{d.parse_error}</p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="lg:col-span-2">
        <Card className="border-border/60 sticky top-4">
          <CardContent className="p-5">
            {!selected ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-3 opacity-40" />
                Select a document to review.
              </div>
            ) : (
              <DocumentDetail
                doc={selected}
                signedUrl={signedUrl}
                busy={actionBusy}
                onReparse={() => handleReparse(selected.id)}
                onApprove={() => handleApprove(selected)}
                onReject={() => handleReject(selected.id)}
                onDelete={() => handleDelete(selected.id)}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ParseStatusBadge({ status }: { status: DocumentIntakeRow["parse_status"] }) {
  if (status === "parsed") return <Badge variant="outline" className="h-4 px-1 text-[10px] border-emerald-500/40 text-emerald-500">parsed</Badge>;
  if (status === "parsing") return <Badge variant="outline" className="h-4 px-1 text-[10px] border-blue-500/40 text-blue-500">parsing…</Badge>;
  if (status === "parse_failed") return <Badge variant="outline" className="h-4 px-1 text-[10px] border-destructive/40 text-destructive">failed</Badge>;
  return <Badge variant="outline" className="h-4 px-1 text-[10px] text-muted-foreground">queued</Badge>;
}

function ReviewStatusBadge({ status }: { status: IntakeReviewStatus }) {
  if (status === "approved") return <Badge className="h-4 px-1 text-[10px] bg-emerald-500/15 text-emerald-500 border-emerald-500/30">approved</Badge>;
  if (status === "rejected") return <Badge className="h-4 px-1 text-[10px] bg-destructive/15 text-destructive border-destructive/30">rejected</Badge>;
  if (status === "needs_info") return <Badge className="h-4 px-1 text-[10px] bg-amber-500/15 text-amber-500 border-amber-500/30">needs info</Badge>;
  return <Badge variant="outline" className="h-4 px-1 text-[10px]">pending</Badge>;
}

interface DetailProps {
  doc: DocumentIntakeRow;
  signedUrl: string | null;
  busy: boolean;
  onReparse: () => void;
  onApprove: () => void;
  onReject: () => void;
  onDelete: () => void;
}

function DocumentDetail({ doc, signedUrl, busy, onReparse, onApprove, onReject, onDelete }: DetailProps) {
  const parsed = (doc.parsed_json ?? {}) as Record<string, unknown>;
  const ProfileIcon = PROFILE_META[doc.profile].icon;
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <ProfileIcon className={cn("h-4 w-4", PROFILE_META[doc.profile].tone)} />
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
            {PROFILE_META[doc.profile].label}
          </p>
        </div>
        <h3 className="text-sm font-semibold mt-1 break-words">{doc.file_name}</h3>
        <div className="flex items-center gap-2 mt-1.5">
          <ParseStatusBadge status={doc.parse_status} />
          <ReviewStatusBadge status={doc.review_status} />
          {doc.confidence !== null && (
            <span className="text-[11px] text-muted-foreground">
              Confidence: <span className="tabular-nums">{Math.round(doc.confidence * 100)}%</span>
            </span>
          )}
        </div>
      </div>

      {signedUrl && (
        <a
          href={signedUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-primary hover:underline inline-flex items-center gap-1"
        >
          <Eye className="h-3 w-3" /> Open original
        </a>
      )}

      {doc.parse_status === "parse_failed" && doc.parse_error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          {doc.parse_error}
        </div>
      )}

      {doc.parse_status === "parsed" && (
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
            Extracted fields
          </p>
          <div className="rounded-md border border-border/60 bg-muted/20 p-3 max-h-72 overflow-auto">
            <ParsedFields parsed={parsed} profile={doc.profile} vehicleLinked={!!doc.fleet_vehicle_id} vin={doc.extracted_vin} vinValid={doc.vin_valid} />
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 pt-2 border-t border-border/60">
        {doc.review_status === "pending_review" && (
          <>
            <Button
              size="sm"
              onClick={onApprove}
              disabled={busy || doc.parse_status !== "parsed"}
              className="gap-1.5"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Approve & create
            </Button>
            <Button size="sm" variant="outline" onClick={onReject} disabled={busy} className="gap-1.5">
              <XCircle className="h-3.5 w-3.5" /> Reject
            </Button>
          </>
        )}
        {(doc.parse_status === "parse_failed" || doc.parse_status === "pending") && (
          <Button size="sm" variant="outline" onClick={onReparse} disabled={busy} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Re-parse
          </Button>
        )}
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={onDelete} disabled={busy} className="gap-1.5 text-muted-foreground hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function ParsedFields({
  parsed,
  profile,
  vehicleLinked,
  vin,
  vinValid,
}: {
  parsed: Record<string, unknown>;
  profile: IntakeProfile;
  vehicleLinked: boolean;
  vin: string | null;
  vinValid: boolean | null;
}) {
  const lineItems = Array.isArray(parsed.line_items) ? parsed.line_items as Array<Record<string, unknown>> : [];

  return (
    <div className="space-y-1">
      {profile === "service" && (
        <>
          <ParsedFieldRow label="Vendor" value={parsed.vendor_name} />
          <ParsedFieldRow label="Date" value={parsed.transaction_date} />
          <div className="flex items-start justify-between gap-3 py-1 text-xs border-b border-border/40">
            <span className="text-muted-foreground">VIN</span>
            <span className="font-mono text-right">
              {vin ?? "—"}
              {vin && vinValid === false && <span className="text-destructive ml-1">(invalid)</span>}
              {vin && vinValid && vehicleLinked && <span className="text-emerald-500 ml-1">(linked)</span>}
            </span>
          </div>
          <ParsedFieldRow label="Mileage" value={parsed.mileage} />
          <ParsedFieldRow label="Plate" value={parsed.license_plate} />
          <ParsedFieldRow label="Vehicle" value={[parsed.vehicle_year, parsed.vehicle_make, parsed.vehicle_model].filter(Boolean).join(" ")} />
          <ParsedFieldRow label="Oil type" value={parsed.oil_type} />
          <ParsedFieldRow label="Oil spec" value={parsed.oil_spec} />
          <ParsedFieldRow label="Labor" value={fmtMoney(parsed.labor_total)} />
          <ParsedFieldRow label="Parts" value={fmtMoney(parsed.parts_total)} />
          <ParsedFieldRow label="Subtotal" value={fmtMoney(parsed.subtotal)} />
          <ParsedFieldRow label="Tax" value={fmtMoney(parsed.tax_amount)} />
          <ParsedFieldRow label="Total" value={fmtMoney(parsed.total_amount)} />
        </>
      )}
      {profile === "fuel" && (
        <>
          <ParsedFieldRow label="Station" value={parsed.station_name} />
          <ParsedFieldRow label="Location" value={parsed.station_location} />
          <ParsedFieldRow label="Date" value={parsed.transaction_date} />
          <ParsedFieldRow label="Fuel type" value={parsed.fuel_type} />
          <ParsedFieldRow label="Gallons" value={parsed.gallons} />
          <ParsedFieldRow label="Price/gal" value={fmtMoney(parsed.price_per_gallon)} />
          <ParsedFieldRow label="Odometer" value={parsed.odometer} />
          <div className="flex items-start justify-between gap-3 py-1 text-xs border-b border-border/40">
            <span className="text-muted-foreground">VIN</span>
            <span className="font-mono text-right">
              {vin ?? "—"}
              {vin && vehicleLinked && <span className="text-emerald-500 ml-1">(linked)</span>}
            </span>
          </div>
          <ParsedFieldRow label="Total" value={fmtMoney(parsed.total_amount)} />
        </>
      )}
      {profile === "general" && (
        <>
          <ParsedFieldRow label="Vendor" value={parsed.vendor_name} />
          <ParsedFieldRow label="Date" value={parsed.transaction_date} />
          <ParsedFieldRow label="Subtotal" value={fmtMoney(parsed.subtotal)} />
          <ParsedFieldRow label="Tax" value={fmtMoney(parsed.tax_amount)} />
          <ParsedFieldRow label="Total" value={fmtMoney(parsed.total_amount)} />
          <ParsedFieldRow label="Suggested category" value={parsed.suggested_category} />
        </>
      )}

      {lineItems.length > 0 && (
        <div className="pt-2 mt-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Line items</p>
          {lineItems.map((li, i) => (
            <div key={i} className="flex items-center justify-between text-[11px] py-0.5">
              <span className="truncate flex-1 mr-2">{String(li.description ?? "")}</span>
              <span className="text-muted-foreground tabular-nums whitespace-nowrap">
                {Number(li.quantity ?? 1)} × {fmtMoney(li.unit_price)} = {fmtMoney(li.line_total)}
              </span>
            </div>
          ))}
        </div>
      )}

      {Object.keys(parsed).length === 0 && (
        <p className="text-xs text-muted-foreground py-2">No fields extracted.</p>
      )}
    </div>
  );
}

function ParsedFieldRow({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-xs border-b border-border/40 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right break-words">{String(value)}</span>
    </div>
  );
}

function fmtMoney(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return `$${n.toFixed(2)}`;
}

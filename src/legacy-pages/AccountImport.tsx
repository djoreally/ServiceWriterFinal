import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileJson, Loader2, ShieldCheck, Upload, XCircle } from "lucide-react";
import { useWorkspaceSelection } from "@/hooks/useWorkspaceSelection";
import { nextApi } from "@/lib/nextApiClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { accountExportSchema, canCommitAccountImport, parseAccountExport, planAccountImport, summarizeAccountExport, type AccountExport, type AccountImportPlan } from "@/features/account-import/accountImport";

const numberFormat = new Intl.NumberFormat();

function formatCount(value: number) { return numberFormat.format(value); }

export default function AccountImport() {
  const { memberships, selectedWorkspaceId, selectedWorkspace, selectWorkspace, loading: workspaceLoading } = useWorkspaceSelection();
  const [exportData, setExportData] = useState<AccountExport | null>(null);
  const [plan, setPlan] = useState<AccountImportPlan | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [stagedBatchId, setStagedBatchId] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<{ status: string; counts: Record<string, number> } | null>(null);

  const sectionSummary = useMemo(() => exportData ? summarizeAccountExport(exportData) : [], [exportData]);
  const blockingIssues = plan?.issues.filter((item) => item.severity === "error") ?? [];

  async function handleFile(file: File) {
    setBusy(true);
    setMessage(null);
      setPlan(null);
      setStagedBatchId(null);
      setExecutionResult(null);
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error("For safety, account exports must be 25 MB or smaller.");
      if (!file.name.toLowerCase().endsWith(".json")) throw new Error("Upload the JSON account export from the old platform.");
      const parsed = parseAccountExport(JSON.parse(await file.text()));
      if (!parsed.exportData) throw new Error(parsed.issues[0]?.message ?? "The file is not a supported account export.");
      setExportData(parsed.exportData);
      setFileName(file.name);
      if (selectedWorkspaceId) setPlan(planAccountImport(parsed.exportData, selectedWorkspaceId));
    } catch (cause) {
      setExportData(null);
      setFileName(null);
      setMessage(cause instanceof Error ? cause.message : "Unable to read this export.");
    } finally {
      setBusy(false);
    }
  }

  async function buildPreview() {
    if (!exportData || !selectedWorkspaceId) return;
    setBusy(true);
    try {
      setPlan(planAccountImport(exportData, selectedWorkspaceId));
      const staged = await nextApi.imports.stage(selectedWorkspaceId, fileName ?? "account-export.json", exportData);
      const batch = staged.data as { id?: string };
      setStagedBatchId(batch.id ?? null);
      setMessage("Dry run complete and batch staged securely. Review the warnings before importing.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to stage the import batch.");
    } finally {
      setBusy(false);
    }
  }

  async function executeImport() {
    if (!exportData || !selectedWorkspaceId || !stagedBatchId || !plan || !canCommitAccountImport(plan)) return;
    setExecuting(true);
    setMessage(null);
    try {
      const response = await nextApi.imports.execute(selectedWorkspaceId, stagedBatchId, exportData);
      const result = response.data as { status: string; counts: Record<string, number> };
      setExecutionResult(result);
      setMessage("Import completed. Review the per-batch result before continuing.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "The import could not be completed.");
    } finally {
      setExecuting(false);
    }
  }

  async function rollbackImport() {
    if (!selectedWorkspaceId || !stagedBatchId) return;
    setExecuting(true);
    try {
      await nextApi.imports.rollback(selectedWorkspaceId, stagedBatchId);
      setMessage("The records created by this batch were rolled back. Matched legacy records were preserved.");
      setExecutionResult(null);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "The import batch could not be rolled back.");
    } finally {
      setExecuting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 pb-10 sm:p-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2"><Badge variant="secondary">Migration Center</Badge><Badge variant="outline">Dry run first</Badge></div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Import account data</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Bring customers, vehicles, appointments, service history, invoices, payments, and settings from the old platform into one selected workspace without silently merging records.</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 text-emerald-600" /> No records are written during preview</div>
      </header>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" /> 1. Select destination workspace</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {workspaceLoading ? <p className="text-sm text-muted-foreground">Loading your workspaces…</p> : memberships.length === 0 ? <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">You need an active workspace membership before importing account data.</div> : <>
            <Select value={selectedWorkspaceId ?? undefined} onValueChange={(value) => { const membership = memberships.find((item) => item.workspace_id === value); if (membership) { selectWorkspace(value); const nextPlan = exportData ? planAccountImport(exportData, value) : null; setPlan(nextPlan); setStagedBatchId(null); setExecutionResult(null); } }}>
              <SelectTrigger className="w-full max-w-xl"><SelectValue placeholder="Choose a workspace" /></SelectTrigger>
              <SelectContent>{memberships.filter((item) => item.is_active && item.workspaces).map((membership) => <SelectItem key={membership.workspace_id} value={membership.workspace_id}>{membership.workspaces?.name} · {membership.role}</SelectItem>)}</SelectContent>
            </Select>
            {selectedWorkspace && <p className="text-xs text-muted-foreground">Records will be assigned only to <strong>{selectedWorkspace.workspaces?.name}</strong>. Importing into another workspace requires selecting it explicitly.</p>}
          </>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><FileJson className="h-5 w-5" /> 2. Upload the old-platform export</CardTitle></CardHeader>
        <CardContent>
          <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/10 p-6 text-center transition hover:border-primary/50 hover:bg-muted/20">
            <input className="sr-only" type="file" accept="application/json,.json" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleFile(file); event.currentTarget.value = ""; }} />
            {busy ? <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" /> : <Upload className="mb-3 h-8 w-8 text-muted-foreground" />}
            <span className="font-medium">{fileName ?? "Choose a JSON export"}</span>
            <span className="mt-1 text-xs text-muted-foreground">Maximum 25 MB · parsed locally · no upload during preview</span>
          </label>
          {message && <p className="mt-3 rounded-md border bg-muted/30 p-3 text-sm">{message}</p>}
        </CardContent>
      </Card>

      {exportData && <>
        <Card>
          <CardHeader><CardTitle>3. Export summary</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <Metric label="Export version" value={exportData.exportVersion} />
              <Metric label="Source email" value={exportData.email} />
              <Metric label="Sections" value={formatCount(sectionSummary.length)} />
              <Metric label="Total records" value={formatCount(sectionSummary.reduce((sum, item) => sum + item.count, 0))} />
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{sectionSummary.map((item) => <div key={item.section} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"><span className="truncate pr-3">{item.section}</span><Badge variant={item.count ? "secondary" : "outline"}>{formatCount(item.count)}</Badge></div>)}</div>
            <Button onClick={() => void buildPreview()} disabled={!selectedWorkspaceId || busy}>{busy ? "Staging…" : "Run dry-run validation"}</Button>
          </CardContent>
        </Card>

        {plan && <Card>
          <CardHeader><CardTitle className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><span>4. Review import plan</span><Badge variant={canCommitAccountImport(plan) ? "default" : "destructive"}>{plan.totals.errors ? `${plan.totals.errors} blocking errors` : "No blocking errors"}</Badge></CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-4"><Metric label="Source rows" value={formatCount(plan.totals.sourceRows)} /><Metric label="Accepted rows" value={formatCount(plan.totals.acceptedRows)} /><Metric label="Warnings" value={formatCount(plan.totals.warnings)} /><Metric label="Target workspace" value={selectedWorkspace?.workspaces?.name ?? "Not selected"} /></div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{plan.sections.map((item) => <div key={item.section} className="rounded-md border p-3"><div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{item.section}</span>{item.status === "ready" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : item.status === "empty" ? <Badge variant="outline">Empty</Badge> : item.status === "unsupported" ? <Badge variant="outline">Review</Badge> : <AlertTriangle className="h-4 w-4 text-amber-600" />}</div><p className="mt-1 text-xs text-muted-foreground">{formatCount(item.acceptedRows)} of {formatCount(item.sourceRows)} rows ready · {formatCount(item.warnings)} warnings</p></div>)}</div>
            {plan.issues.length > 0 && <div className="rounded-md border"><div className="border-b px-3 py-2 text-sm font-medium">Validation findings</div><ScrollArea className="h-64"><div className="space-y-2 p-3">{plan.issues.slice(0, 100).map((item, index) => <div key={`${item.code}-${index}`} className="flex gap-2 text-sm"><span className="mt-0.5 shrink-0">{item.severity === "error" ? <XCircle className="h-4 w-4 text-destructive" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}</span><span>{item.message}{item.section ? ` (${item.section}${item.row ? `, row ${item.row}` : ""})` : ""}</span></div>)}</div></ScrollArea></div>}
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><strong>Safe import boundary:</strong> this first step only validates and previews the account export. Actual writes will require an approved import batch, explicit duplicate decisions, and the server-side workspace-scoped importer.</div>
            {executionResult ? <div className="space-y-3 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950"><p className="font-medium">Batch completed: {executionResult.status}</p><p>Created: {executionResult.counts.created ?? 0} · Matched: {executionResult.counts.matched ?? 0} · Skipped: {executionResult.counts.skipped ?? 0} · Failed: {executionResult.counts.failed ?? 0}</p><Button variant="outline" onClick={() => void rollbackImport()} disabled={executing}>Rollback records created by this batch</Button></div> : <Button onClick={() => void executeImport()} disabled={!stagedBatchId || !canCommitAccountImport(plan) || executing} title={blockingIssues.length ? "Resolve blocking validation errors first" : !stagedBatchId ? "Run dry-run validation first" : "Import approved records"}>{executing ? "Importing…" : "Import approved records"}</Button>}
          </CardContent>
        </Card>}
      </>}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border bg-card p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 truncate text-sm font-semibold">{value}</p></div>;
}

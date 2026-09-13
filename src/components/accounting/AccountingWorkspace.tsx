"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Upload, RefreshCw, AlertTriangle, Landmark, TrendingUp, TrendingDown, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import { BookkeepingTools } from "@/components/accounting/BookkeepingTools";
import {
  ACCOUNTING_CLASSIFICATIONS,
  normalizeBankRows,
  stableRowKey,
  summarizeAccounting,
  type AccountingClassification,
  type ImportedBankRow,
} from "@/features/accounting/accounting-engine";
import {
  classifyStoredTransaction,
  createFinancialImport,
  fetchBankTransactions,
  type StoredBankTransaction,
} from "@/application/queries/accounting.query";

async function sha256(text: string) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function title(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function Metric({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-black">{value}</p>
        {helper ? <p className="mt-1 text-xs text-muted-foreground">{helper}</p> : null}
      </CardContent>
    </Card>
  );
}

function storedToSummaryRows(rows: StoredBankTransaction[]) {
  return rows.map((row) => ({
    amount: Number(row.amount),
    classification: row.classification,
  }));
}

export function AccountingWorkspace() {
  const { formatCurrency } = useRegionalSettings();
  const [transactions, setTransactions] = useState<StoredBankTransaction[]>([]);
  const [preview, setPreview] = useState<ImportedBankRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [fileHash, setFileHash] = useState("");
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTransactions(await fetchBankTransactions());
    } catch (error) {
      console.error(error);
      toast.error("Unable to load accounting transactions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => summarizeAccounting(storedToSummaryRows(transactions)), [transactions]);
  const previewSummary = useMemo(() => summarizeAccounting(preview), [preview]);

  const handleFile = async (file: File) => {
    try {
      const bytes = await file.arrayBuffer();
      const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
      const first = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(first, { defval: "" });
      const rows = normalizeBankRows(rawRows);
      if (!rows.length) throw new Error("No recognizable bank transactions were found.");
      setFileName(file.name);
      setFileHash(await sha256(Array.from(new Uint8Array(bytes)).join(",")));
      setPreview(rows);
      toast.success(`${rows.length} transactions recognized.`);
    } catch (error) {
      console.error(error);
      setPreview([]);
      toast.error(error instanceof Error ? error.message : "Could not read this statement.");
    }
  };

  const importPreview = async () => {
    if (!preview.length || !fileName || !fileHash) return;
    setImporting(true);
    try {
      const rows = await Promise.all(preview.map(async (row) => ({
        ...row,
        sourceRowHash: await sha256(stableRowKey(row)),
      })));
      const result = await createFinancialImport({ fileName, sourceHash: fileHash, rows });
      toast.success(`Imported ${result.imported}; skipped ${result.duplicates} duplicate${result.duplicates === 1 ? "" : "s"}.`);
      setPreview([]);
      setFileName("");
      setFileHash("");
      await load();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  };

  const updateClassification = async (row: StoredBankTransaction, classification: AccountingClassification) => {
    const previous = transactions;
    setTransactions((current) => current.map((item) => item.id === row.id ? {
      ...item,
      classification,
      review_status: classification === "unresolved" ? "pending" : "approved",
      confidence: classification === "unresolved" ? 0 : 1,
    } : item));
    try {
      await classifyStoredTransaction(row.id, classification);
    } catch (error) {
      console.error(error);
      setTransactions(previous);
      toast.error("Classification was not saved.");
    }
  };

  const classifiedCount = transactions.filter((row) => row.classification !== "unresolved").length;
  const classificationProgress = transactions.length ? (classifiedCount / transactions.length) * 100 : 0;

  const insights = [
    summary.unresolvedCount
      ? `${summary.unresolvedCount} transaction${summary.unresolvedCount === 1 ? "" : "s"} still need review (${formatCurrency(summary.unresolvedAmount)}).`
      : "All imported transactions are classified.",
    `Operating revenue is ${formatCurrency(summary.revenue)} against ${formatCurrency(summary.operatingExpenses)} of classified operating expense.`,
    `Cash changed by ${formatCurrency(summary.netCashChange)} across imported bank activity; capital and owner draws stay separate from P&L.`,
  ];

  return (
    <div className="space-y-6">
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Landmark className="h-5 w-5 text-primary" />
                Accounting Import
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Upload CSV/XLS/XLSX bank exports. Service Writer preserves the original row, classifies it, and keeps capital, owner draws, revenue, and expenses separate.
              </p>
            </div>
            <label className="inline-flex">
              <input
                type="file"
                accept=".csv,.xls,.xlsx"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleFile(file);
                  event.currentTarget.value = "";
                }}
              />
              <span className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">
                <Upload className="h-4 w-4" />
                Upload Statement
              </span>
            </label>
          </div>
        </CardHeader>

        {preview.length ? (
          <CardContent className="space-y-4 border-t pt-5">
            <div className="flex flex-col gap-3 rounded-lg bg-muted/40 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-bold">{fileName}</p>
                <p className="text-sm text-muted-foreground">{preview.length} recognized transactions · {previewSummary.unresolvedCount} need review after import</p>
              </div>
              <Button onClick={importPreview} disabled={importing}>
                {importing ? "Importing…" : `Import ${preview.length} transactions`}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Metric label="Preview cash in" value={formatCurrency(previewSummary.cashIn)} />
              <Metric label="Preview cash out" value={formatCurrency(previewSummary.cashOut)} />
              <Metric label="P&L revenue" value={formatCurrency(previewSummary.revenue)} />
              <Metric label="Needs review" value={formatCurrency(previewSummary.unresolvedAmount)} />
            </div>
          </CardContent>
        ) : null}
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Metric label="Operating revenue" value={formatCurrency(summary.revenue)} helper="Capital excluded" />
        <Metric label="Operating expenses" value={formatCurrency(summary.operatingExpenses)} helper="Owner draws excluded" />
        <Metric label="Operating profit" value={formatCurrency(summary.operatingProfit)} helper="Before tax / depreciation" />
        <Metric label="Net cash change" value={formatCurrency(summary.netCashChange)} helper="All imported cash movement" />
        <Metric label="Unresolved" value={formatCurrency(summary.unresolvedAmount)} helper={`${summary.unresolvedCount} transactions`} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Imported Transactions</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Every row remains traceable to the uploaded statement.</p>
              </div>
              <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                <RefreshCw className="mr-2 h-4 w-4" /> Refresh
              </Button>
            </div>
            <div className="space-y-1 pt-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Classification completeness</span>
                <span>{Math.round(classificationProgress)}%</span>
              </div>
              <Progress value={classificationProgress} />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Loading accounting ledger…</div>
            ) : transactions.length === 0 ? (
              <div className="rounded-lg border border-dashed p-10 text-center">
                <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 font-semibold">No bank statement imported yet</p>
                <p className="mt-1 text-sm text-muted-foreground">Upload a Chase or other bank CSV/XLSX export to start the running books.</p>
              </div>
            ) : (
              <div className="max-h-[620px] overflow-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background">
                    <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                      <th className="p-3">Date</th>
                      <th className="p-3">Description</th>
                      <th className="p-3 text-right">Amount</th>
                      <th className="p-3">Classification</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((row) => (
                      <tr key={row.id} className="border-b last:border-0">
                        <td className="whitespace-nowrap p-3">{row.posted_on}</td>
                        <td className="max-w-[420px] p-3">
                          <p className="truncate font-medium" title={row.description_raw}>{row.description_raw}</p>
                          {row.review_status === "pending" ? (
                            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-amber-600">
                              <AlertTriangle className="h-3 w-3" /> Review
                            </p>
                          ) : null}
                        </td>
                        <td className={`whitespace-nowrap p-3 text-right font-bold ${Number(row.amount) >= 0 ? "text-emerald-600" : ""}`}>
                          {formatCurrency(Number(row.amount))}
                        </td>
                        <td className="p-3">
                          <select
                            value={row.classification}
                            onChange={(event) => void updateClassification(row, event.target.value as AccountingClassification)}
                            className="h-9 min-w-[170px] rounded-md border bg-background px-2 text-xs"
                          >
                            {ACCOUNTING_CLASSIFICATIONS.map((classification) => (
                              <option key={classification} value={classification}>{title(classification)}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <WalletCards className="h-4 w-4" />
                Cash Flow
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-muted-foreground"><TrendingUp className="h-4 w-4" /> Cash in</span>
                <span className="font-bold">{formatCurrency(summary.cashIn)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-muted-foreground"><TrendingDown className="h-4 w-4" /> Cash out</span>
                <span className="font-bold">{formatCurrency(summary.cashOut)}</span>
              </div>
              <div className="flex items-center justify-between border-t pt-3">
                <span className="text-sm font-semibold">Net change</span>
                <span className="text-lg font-black">{formatCurrency(summary.netCashChange)}</span>
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                Investor capital: <strong className="text-foreground">{formatCurrency(summary.investorCapital)}</strong><br />
                Owner draws: <strong className="text-foreground">{formatCurrency(summary.ownerDraws)}</strong>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Books Analyst</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {insights.map((insight) => (
                <div key={insight} className="rounded-lg border bg-muted/30 p-3 text-sm leading-5">{insight}</div>
              ))}
              <p className="text-[11px] text-muted-foreground">
                These statements are deterministic ledger analysis, not tax or CPA advice.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <BookkeepingTools
        facts={{
          cashIn: summary.cashIn,
          cashOut: summary.cashOut,
          netCashChange: summary.netCashChange,
          revenue: summary.revenue,
          operatingExpenses: summary.operatingExpenses,
          operatingProfit: summary.operatingProfit,
          ownerDraws: summary.ownerDraws,
          investorCapital: summary.investorCapital,
          unresolvedAmount: summary.unresolvedAmount,
          unresolvedCount: summary.unresolvedCount,
        }}
      />
    </div>
  );
}

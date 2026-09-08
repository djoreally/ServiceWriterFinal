import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Droplets, Gauge, Wrench, Trophy, Download, Search, X } from "lucide-react";
import { DateRange } from "react-day-picker";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatCard } from "@/components/dashboard/StatCard";
import { DateRangeFilter, getDateRangeFromPreset, type DateRangePreset } from "@/components/dashboard/DateRangeFilter";
import { toast } from "@/components/ui/sonner";
import { fetchOilUsage, type FetchOilUsageResult, type UsageRow } from "@/application/queries/inventory-usage.query";

const ALL = "__all__";

function sourceLabel(source: UsageRow["source"]) {
  return source === "inventory_reconciled" ? "Inventory reconciled" : "Completed service";
}

function downloadCsv(filename: string, rows: UsageRow[]) {
  const header = ["Date", "Customer", "Vehicle", "Oil", "Quarts", "Source", "Appointment ID"];
  const esc = (value: unknown) => {
    const s = value == null ? "" : String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = rows.map((row) => [
    format(new Date(row.consumed_at), "M/d/yyyy h:mm a"),
    row.customer_name,
    row.vehicle_label,
    row.item_name,
    row.qty_in_qts.toFixed(2),
    sourceLabel(row.source),
    row.appointment_id,
  ].map(esc).join(","));
  const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function OilUsageTab() {
  const [preset, setPreset] = useState<DateRangePreset>("30d");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(getDateRangeFromPreset("30d"));
  const [data, setData] = useState<FetchOilUsageResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [drillDay, setDrillDay] = useState<string | null>(null);
  const [itemId, setItemId] = useState(ALL);
  const [source, setSource] = useState(ALL);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!dateRange?.from || !dateRange?.to) return;
    const from = new Date(dateRange.from); from.setHours(0, 0, 0, 0);
    const to = new Date(dateRange.to); to.setHours(23, 59, 59, 999);
    setLoading(true);
    fetchOilUsage({
      from,
      to,
      itemIds: itemId !== ALL ? [itemId] : undefined,
      source: source === "completed_service" || source === "inventory_reconciled" ? source : null,
      search: debouncedSearch || null,
    })
      .then(setData)
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Failed to load oil usage"))
      .finally(() => setLoading(false));
  }, [dateRange?.from, dateRange?.to, itemId, source, debouncedSearch]);

  const totals = data?.totals;
  const drillRows = useMemo(() => drillDay && data ? data.rows.filter((row) => row.day === drillDay) : [], [drillDay, data]);
  const hasFilters = itemId !== ALL || source !== ALL || debouncedSearch.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-bold">Oil Usage</h3>
          <p className="text-sm text-muted-foreground">
            Derived from oil quantity recorded on completed services. Inventory setup is optional and never required for this history.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <DateRangeFilter
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            preset={preset}
            onPresetChange={(next) => {
              setPreset(next);
              if (next !== "custom") setDateRange(getDateRangeFromPreset(next));
            }}
          />
          <Button variant="outline" className="gap-2" disabled={!data?.rows.length} onClick={() => data && downloadCsv(`oil-usage-${format(new Date(), "yyyy-MM-dd")}.csv`, data.rows)}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 max-w-sm">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer, vehicle, oil…" className="pl-8" />
        </div>
        <Select value={itemId} onValueChange={setItemId}>
          <SelectTrigger className="w-[190px]"><SelectValue placeholder="Oil type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All oil types</SelectItem>
            {data?.availableItems.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger className="w-[190px]"><SelectValue placeholder="Reconciliation" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All completed usage</SelectItem>
            <SelectItem value="completed_service">Service only</SelectItem>
            <SelectItem value="inventory_reconciled">Inventory reconciled</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && <Button variant="ghost" size="sm" className="gap-1" onClick={() => { setItemId(ALL); setSource(ALL); setSearch(""); }}><X className="h-3 w-3" /> Clear</Button>}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard title="Total Quarts" value={loading ? "…" : (totals?.total_qt ?? 0).toFixed(2)} icon={Droplets} subtitle="Completed service usage" iconBgColor="bg-primary/10" iconColor="text-primary" />
        <StatCard title="Total Gallons" value={loading ? "…" : (totals?.total_gal ?? 0).toFixed(2)} icon={Gauge} subtitle="qt ÷ 4" iconBgColor="bg-blue-500/10" iconColor="text-blue-600" />
        <StatCard title="Services" value={loading ? "…" : (totals?.service_count ?? 0)} icon={Wrench} subtitle="Jobs with oil quantity" iconBgColor="bg-emerald-500/10" iconColor="text-emerald-600" />
        <StatCard title="Top Oil" value={loading ? "…" : (totals?.top_item_name ?? "—")} icon={Trophy} subtitle={totals?.top_item_qt ? `${totals.top_item_qt.toFixed(2)} qt` : "No usage yet"} iconBgColor="bg-amber-500/10" iconColor="text-amber-600" />
      </div>

      <Card><CardContent className="p-4">
        <p className="mb-3 text-sm font-medium">Quarts consumed per day</p>
        <div className="h-64">
          {data?.byDay.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={data.byDay}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="day" tickFormatter={(d) => format(new Date(d), "MMM d")} fontSize={12} /><YAxis fontSize={12} /><Tooltip labelFormatter={(d) => format(new Date(d as string), "M/d/yyyy")} formatter={(v: number) => [`${Number(v).toFixed(2)} qt`, "Used"]} /><Bar dataKey="qty_qt" fill="hsl(var(--primary))" radius={[4,4,0,0]} onClick={(d: any) => setDrillDay(d.day)} style={{ cursor: "pointer" }} /></BarChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{loading ? "Loading…" : "No completed jobs with oil entered in this range"}</div>}
        </div>
      </CardContent></Card>

      {data?.byItem.length ? <Card><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>OIL TYPE</TableHead><TableHead className="text-right">QUARTS USED</TableHead><TableHead className="text-right">SERVICED QTY</TableHead></TableRow></TableHeader><TableBody>{data.byItem.map((item) => <TableRow key={item.inventory_item_id}><TableCell className="font-medium">{item.name}</TableCell><TableCell className="text-right">{item.qty_qt.toFixed(2)} qt</TableCell><TableCell className="text-right">{item.raw_qty.toFixed(2)} qt</TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card> : null}

      <Card><CardContent className="p-0"><div className="overflow-x-auto"><Table>
        <TableHeader><TableRow><TableHead>WHEN</TableHead><TableHead>CUSTOMER</TableHead><TableHead>VEHICLE</TableHead><TableHead>OIL</TableHead><TableHead className="text-right">QTY</TableHead><TableHead>STATUS</TableHead></TableRow></TableHeader>
        <TableBody>{!data?.rows.length ? <TableRow><TableCell colSpan={6} className="py-12 text-center text-muted-foreground">{loading ? "Loading…" : "No completed jobs with oil entered in this range"}</TableCell></TableRow> : data.rows.map((row) => <TableRow key={row.id}><TableCell className="text-sm">{format(new Date(row.consumed_at), "M/d/yyyy h:mm a")}</TableCell><TableCell>{row.customer_name ?? "—"}</TableCell><TableCell>{row.vehicle_label ?? "—"}</TableCell><TableCell className="font-medium">{row.item_name}</TableCell><TableCell className="text-right">{row.qty_in_qts.toFixed(2)} qt</TableCell><TableCell><Badge variant={row.source === "inventory_reconciled" ? "outline" : "secondary"}>{sourceLabel(row.source)}</Badge></TableCell></TableRow>)}</TableBody>
      </Table></div></CardContent></Card>

      <Dialog open={!!drillDay} onOpenChange={(open) => !open && setDrillDay(null)}><DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{drillDay ? format(new Date(drillDay), "M/d/yyyy") : ""} — Oil Usage</DialogTitle></DialogHeader><div className="space-y-2">{drillRows.map((row) => <div key={row.id} className="flex items-center justify-between rounded-lg border p-3"><div><p className="font-medium">{row.item_name}</p><p className="text-xs text-muted-foreground">{row.customer_name ?? "—"} • {row.vehicle_label ?? "—"}</p></div><div className="text-right"><p className="font-semibold">{row.qty_in_qts.toFixed(2)} qt</p><p className="text-xs text-muted-foreground">{sourceLabel(row.source)}</p></div></div>)}</div></DialogContent></Dialog>
    </div>
  );
}

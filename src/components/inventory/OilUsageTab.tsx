import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatCard } from "@/components/dashboard/StatCard";
import { DateRangeFilter, getDateRangeFromPreset, type DateRangePreset } from "@/components/dashboard/DateRangeFilter";
import { Droplets, Gauge, Wrench, Trophy, Download, Truck, X, Search } from "lucide-react";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { fetchOilUsage, type FetchOilUsageResult, type UsageRow } from "@/application/queries/inventory-usage.query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DateRange } from "react-day-picker";

function downloadCsv(filename: string, rows: UsageRow[]) {
  const header = ["Date", "Customer", "Vehicle", "Item", "Qty", "Unit", "Qty (qt)", "Source", "Van", "Appointment ID"];
  const escape = (v: any) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = rows.map(r => [
    format(new Date(r.consumed_at), "yyyy-MM-dd HH:mm"),
    r.customer_name ?? "",
    r.vehicle_label ?? "",
    r.item_name,
    r.quantity,
    r.unit,
    r.qty_in_qts.toFixed(2),
    r.source,
    r.van_name ?? "",
    r.appointment_id ?? "",
  ].map(escape).join(","));
  const csv = [header.join(","), ...body].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const ALL = "__all__";

export function OilUsageTab() {
  const [preset, setPreset] = useState<DateRangePreset>("30d");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(getDateRangeFromPreset("30d"));
  const [data, setData] = useState<FetchOilUsageResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [drillDay, setDrillDay] = useState<string | null>(null);

  // Filters
  const [itemId, setItemId] = useState<string>(ALL);
  const [vanId, setVanId] = useState<string>(ALL);
  const [source, setSource] = useState<string>(ALL);
  const [search, setSearch] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!dateRange?.from || !dateRange?.to) return;
    const from = new Date(dateRange.from);
    from.setHours(0, 0, 0, 0);
    const to = new Date(dateRange.to);
    to.setHours(23, 59, 59, 999);
    setLoading(true);
    fetchOilUsage({
      from,
      to,
      itemIds: itemId !== ALL ? [itemId] : undefined,
      vanId: vanId !== ALL ? vanId : null,
      source: source === "van" || source === "warehouse" ? source : null,
      search: debouncedSearch || null,
    })
      .then(setData)
      .catch((e) => toast.error(e.message || "Failed to load usage"))
      .finally(() => setLoading(false));
  }, [dateRange?.from, dateRange?.to, itemId, vanId, source, debouncedSearch]);

  const totals = data?.totals;
  const drillRows = useMemo(
    () => (drillDay && data ? data.rows.filter(r => r.day === drillDay) : []),
    [drillDay, data],
  );

  const hasFilters = itemId !== ALL || vanId !== ALL || source !== ALL || debouncedSearch.length > 0;
  const clearFilters = () => { setItemId(ALL); setVanId(ALL); setSource(ALL); setSearch(""); };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold">Oil Usage</h3>
          <p className="text-sm text-muted-foreground">
            Calculates oil consumed from the oil quantity entered on completed jobs. Filter by date range to see exactly how much was used.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <DateRangeFilter
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            preset={preset}
            onPresetChange={(p) => {
              setPreset(p);
              if (p !== "custom") setDateRange(getDateRangeFromPreset(p));
            }}
          />
          <Button
            variant="outline"
            className="gap-2"
            disabled={!data?.rows.length}
            onClick={() => data && downloadCsv(`oil-usage-${format(new Date(), "yyyy-MM-dd")}.csv`, data.rows)}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer, vehicle, oil…"
            className="pl-8"
          />
        </div>
        <Select value={itemId} onValueChange={setItemId}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Oil type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All oil types</SelectItem>
            {data?.availableItems.map((i) => (
              <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Source" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All sources</SelectItem>
            <SelectItem value="warehouse">Warehouse</SelectItem>
            <SelectItem value="van">Van</SelectItem>
          </SelectContent>
        </Select>
        <Select value={vanId} onValueChange={setVanId}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Van" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All vans</SelectItem>
            {data?.availableVans.map((v) => (
              <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
            <X className="h-3 w-3" /> Clear
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Quarts"
          value={loading ? "…" : (totals?.total_qt ?? 0).toFixed(2)}
          icon={Droplets}
          subtitle="In selected range"
          iconBgColor="bg-primary/10"
          iconColor="text-primary"
        />
        <StatCard
          title="Total Gallons"
          value={loading ? "…" : (totals?.total_gal ?? 0).toFixed(2)}
          icon={Gauge}
          subtitle="qt ÷ 4"
          iconBgColor="bg-blue-500/10"
          iconColor="text-blue-600"
        />
        <StatCard
          title="Services"
          value={loading ? "…" : (totals?.service_count ?? 0)}
          icon={Wrench}
          subtitle="Completed jobs with oil entered"
          iconBgColor="bg-emerald-500/10"
          iconColor="text-emerald-600"
        />
        <StatCard
          title="Top Oil"
          value={loading ? "…" : (totals?.top_item_name ?? "—")}
          icon={Trophy}
          subtitle={totals?.top_item_qt ? `${totals.top_item_qt.toFixed(2)} qt` : "No usage yet"}
          iconBgColor="bg-amber-500/10"
          iconColor="text-amber-600"
        />
      </div>

      {/* Chart */}
      <Card className="border border-border/50">
        <CardContent className="p-4">
          <p className="text-sm font-medium mb-3">Quarts consumed per day (click a bar to drill in)</p>
          <div className="h-64">
            {data?.byDay.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.byDay}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                  <XAxis dataKey="day" tickFormatter={(d) => format(new Date(d), "MMM d")} fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip
                    labelFormatter={(d) => format(new Date(d as string), "PPP")}
                    formatter={(v: number) => [`${Number(v).toFixed(2)} qt`, "Used"]}
                  />
                  <Bar
                    dataKey="qty_qt"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                    onClick={(d: any) => setDrillDay(d.day)}
                    style={{ cursor: "pointer" }}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                {loading ? "Loading…" : "No completed jobs with oil entered in this range"}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* By item */}
      {data?.byItem.length ? (
        <Card className="border border-border/50">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50">
                    <TableHead>OIL TYPE</TableHead>
                    <TableHead className="text-right">QTY ENTERED</TableHead>
                    <TableHead className="text-right">RAW QTY</TableHead>
                    <TableHead>UNIT</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.byItem.map((b) => (
                    <TableRow key={b.inventory_item_id} className="border-border/50">
                      <TableCell className="font-medium">{b.name}</TableCell>
                      <TableCell className="text-right">{b.qty_qt.toFixed(2)} qt</TableCell>
                      <TableCell className="text-right">{b.raw_qty.toFixed(2)}</TableCell>
                      <TableCell className="text-xs uppercase text-muted-foreground">{b.unit}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Detail rows */}
      <Card className="border border-border/50">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50">
                  <TableHead>WHEN</TableHead>
                  <TableHead>CUSTOMER</TableHead>
                  <TableHead>VEHICLE</TableHead>
                  <TableHead>OIL</TableHead>
                  <TableHead className="text-right">QTY</TableHead>
                  <TableHead>SOURCE</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!data?.rows.length ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    {loading ? "Loading…" : "No completed jobs with oil entered in this range"}
                  </TableCell></TableRow>
                ) : data.rows.map((r) => (
                  <TableRow key={r.id} className="border-border/50">
                    <TableCell className="text-sm">{format(new Date(r.consumed_at), "MMM d, h:mm a")}</TableCell>
                    <TableCell>{r.customer_name ?? "—"}</TableCell>
                    <TableCell className="text-sm">{r.vehicle_label ?? "—"}</TableCell>
                    <TableCell className="font-medium">{r.item_name}</TableCell>
                    <TableCell className="text-right">
                      {r.quantity} {r.unit}
                      {r.unit !== "qt" && (
                        <span className="text-xs text-muted-foreground ml-1">({r.qty_in_qts.toFixed(2)} qt)</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.source === "van" ? (
                        <Badge variant="outline" className="gap-1 text-xs">
                          <Truck className="h-3 w-3" />{r.van_name ?? "Van"}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Warehouse</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Drill-down dialog */}
      <Dialog open={!!drillDay} onOpenChange={(o) => !o && setDrillDay(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {drillDay ? format(new Date(drillDay), "PPPP") : ""} — Oil usage
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {drillRows.map((r) => (
              <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50">
                <div>
                  <p className="font-medium">{r.item_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.customer_name ?? "—"} • {r.vehicle_label ?? "—"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{r.quantity} {r.unit}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.source === "van" ? (r.van_name ?? "Van") : "Warehouse"}
                  </p>
                </div>
              </div>
            ))}
            <div className="pt-2 flex items-center justify-between text-sm font-medium border-t border-border/50">
              <span>Day total</span>
              <span>{drillRows.reduce((s, r) => s + r.qty_in_qts, 0).toFixed(2)} qt</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

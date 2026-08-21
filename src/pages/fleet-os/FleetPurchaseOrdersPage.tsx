import { useEffect, useState } from "react";
import { FleetOSLayout } from "@/components/layout/FleetOSLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { fetchFleetPurchaseOrders, type FleetPurchaseOrderSummary } from "@/application/queries/fleet.query";
import {
  ShoppingCart,
  Search,
  Plus,
  DollarSign,
  Calendar,
  Building2,
  AlertTriangle,
} from "lucide-react";
import { AddPurchaseOrderDialog } from "@/components/fleet/AddPurchaseOrderDialog";

const FleetPurchaseOrdersPage = () => {
  const [pos, setPos] = useState<FleetPurchaseOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const loadPos = async () => {
    try {
      const data = await fetchFleetPurchaseOrders();
      setPos(data);
    } catch (err) {
      console.error("[FleetPurchaseOrdersPage] Error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPos();
  }, []);

  const filtered = pos.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.po_number?.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q) ||
      p.fleet_clients?.company_name?.toLowerCase().includes(q)
    );
  });

  const statusStyles: Record<string, string> = {
    open: "bg-emerald-500/10 text-emerald-600",
    partially_used: "bg-amber-500/10 text-amber-600",
    closed: "bg-muted text-muted-foreground",
    expired: "bg-red-500/10 text-red-500",
  };

  const totalOpen = pos.filter((p) => p.status === "open" || p.status === "partially_used").length;

  return (
    <FleetOSLayout title="Purchase Orders">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {pos.length} PO{pos.length !== 1 ? "s" : ""} • {totalOpen} open
          </p>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add PO
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by PO number, description, or company..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* PO List */}
        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading purchase orders...</p>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <ShoppingCart className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="font-medium">No purchase orders</p>
              <p className="text-sm text-muted-foreground mt-1 mb-4">
                POs authorize work and track spend. Attach POs to work orders to prevent billing without authorization.
              </p>
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Add PO
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((p) => {
              const used = Number(p.amount_used) || 0;
              const limit = Number(p.amount_limit) || 0;
              const remaining = limit > 0 ? limit - used : null;
              const utilizationPct = limit > 0 ? Math.round((used / limit) * 100) : null;
              const isNearLimit = utilizationPct !== null && utilizationPct >= 80;
              const isExpiringSoon =
                p.expiry_date &&
                new Date(p.expiry_date).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000 &&
                p.status !== "closed" &&
                p.status !== "expired";

              return (
                <Card
                  key={p.id}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="h-8 w-8 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                            <ShoppingCart className="h-4 w-4 text-orange-600" />
                          </div>
                          <p className="font-mono font-medium text-sm">{p.po_number}</p>
                          <Badge variant="secondary" className={statusStyles[p.status] || ""}>
                            {p.status.replace("_", " ")}
                          </Badge>
                          {isNearLimit && (
                            <span className="flex items-center gap-1 text-[10px] text-amber-600">
                              <AlertTriangle className="h-3 w-3" /> {utilizationPct}% used
                            </span>
                          )}
                          {isExpiringSoon && (
                            <span className="flex items-center gap-1 text-[10px] text-red-500">
                              <AlertTriangle className="h-3 w-3" /> Expiring soon
                            </span>
                          )}
                        </div>
                        {p.description && (
                          <p className="text-xs text-muted-foreground mt-1 ml-10 truncate">{p.description}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-muted-foreground ml-10">
                          {p.fleet_clients?.company_name && (
                            <span className="flex items-center gap-1 text-primary font-medium">
                              <Building2 className="h-3 w-3" /> {p.fleet_clients.company_name}
                            </span>
                          )}
                          {limit > 0 && (
                            <span className="flex items-center gap-1">
                              <DollarSign className="h-3 w-3" />
                              ${used.toLocaleString()} / ${limit.toLocaleString()}
                              {remaining !== null && remaining > 0 && (
                                <span className="text-emerald-600">(${remaining.toLocaleString()} remaining)</span>
                              )}
                            </span>
                          )}
                          {p.issued_date && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" /> Issued: {p.issued_date}
                            </span>
                          )}
                          {p.expiry_date && (
                            <span className="flex items-center gap-1">
                              Expires: {p.expiry_date}
                            </span>
                          )}
                        </div>
                        {/* Utilization bar */}
                        {limit > 0 && (
                          <div className="ml-10 mt-2 w-48">
                            <div className="h-1.5 bg-muted rounded-md overflow-hidden">
                              <div
                                className={`h-full rounded-md transition-all ${
                                  isNearLimit ? "bg-amber-500" : "bg-emerald-500"
                                }`}
                                style={{ width: `${Math.min(utilizationPct || 0, 100)}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
      <AddPurchaseOrderDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={loadPos}
      />
    </FleetOSLayout>
  );
};

export default FleetPurchaseOrdersPage;

import { useEffect, useState } from "react";
import { FleetOSLayout } from "@/components/layout/FleetOSLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@packages/auth";
import {
  FileText, Search, Plus, DollarSign, Clock,
  Calendar, Building2, Shield, ChevronRight,
} from "lucide-react";
import { AddContractDialog } from "@/components/fleet/AddContractDialog";

import { fetchFleetContracts } from "@/application/queries/fleet-contracts.query";
import type { FleetContract } from "@/application/queries/fleet-contracts.query";

const FleetContractsPage = () => {
  const { user } = useAuth();
  const [contracts, setContracts] = useState<FleetContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<FleetContract | null>(null);

  const loadContracts = async () => {
    if (!user?.id) return;
    const data = await fetchFleetContracts(user.id);
    setContracts(data);
    setLoading(false);
  };

  useEffect(() => { loadContracts(); }, [user?.id]);

  const filtered = contracts.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.fleet_clients?.company_name?.toLowerCase().includes(q)
    );
  });

  const invoiceFreqLabels: Record<string, string> = {
    per_service: "Per Service",
    weekly: "Weekly",
    biweekly: "Bi-Weekly",
    monthly: "Monthly",
  };

  return (
    <FleetOSLayout title="Contracts">
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {contracts.length} contract{contracts.length !== 1 ? "s" : ""} •{" "}
            {contracts.filter((c) => c.is_active).length} active
          </p>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New Contract
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by contract name or company..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading contracts...</p>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="font-medium">No contracts yet</p>
              <p className="text-sm text-muted-foreground mt-1 mb-4">
                Contracts drive pricing, SLA tracking, and approval rules. Without contracts, you have chaos.
              </p>
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> New Contract
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((c) => (
              <Card
                key={c.id}
                className="cursor-pointer hover:border-primary/30 transition-colors"
                onClick={() => setEditing(c)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="h-8 w-8 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
                          <FileText className="h-4 w-4 text-indigo-600" />
                        </div>
                        <p className="font-medium text-sm">{c.name}</p>
                        <Badge
                          variant="secondary"
                          className={c.is_active ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}
                        >
                          {c.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground ml-10">
                        {c.fleet_clients?.company_name && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" /> {c.fleet_clients.company_name}
                          </span>
                        )}
                        {c.sla_hours && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" /> SLA: {c.sla_hours}h
                          </span>
                        )}
                        {c.approval_threshold && (
                          <span className="flex items-center gap-1">
                            <Shield className="h-3 w-3" /> Approval &gt; ${Number(c.approval_threshold).toLocaleString()}
                          </span>
                        )}
                        {c.invoice_frequency && (
                          <span className="flex items-center gap-1">
                            <DollarSign className="h-3 w-3" /> {invoiceFreqLabels[c.invoice_frequency] || c.invoice_frequency}
                          </span>
                        )}
                        {(c.start_date || c.end_date) && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {c.start_date || "?"} → {c.end_date || "ongoing"}
                          </span>
                        )}
                      </div>
                      {c.pricing_rules && c.pricing_rules.length > 0 && (
                        <div className="ml-10 mt-2 flex flex-wrap gap-1">
                          {(c.pricing_rules as any[]).slice(0, 3).map((rule: any, i: number) => (
                            <span key={i} className="text-[10px] bg-muted px-2 py-0.5 rounded-md">
                              {rule.service || rule.name}: ${rule.price || rule.amount}
                            </span>
                          ))}
                          {c.pricing_rules.length > 3 && (
                            <span className="text-[10px] text-muted-foreground">
                              +{c.pricing_rules.length - 3} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing(c);
                        }}
                      >
                        Edit
                      </Button>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
      <AddContractDialog
        open={addOpen || !!editing}
        onClose={() => { setAddOpen(false); setEditing(null); }}
        onCreated={() => loadContracts()}
        editingContract={editing || undefined}
      />
    </FleetOSLayout>
  );
};

export default FleetContractsPage;

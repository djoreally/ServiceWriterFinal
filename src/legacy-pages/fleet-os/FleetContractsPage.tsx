/**
 * FleetContractsPage — service agreements (visual redesign).
 *
 * Cognitive-load design: each row answers "who is this contract with, what
 * does it promise, what does it cost" in one glance. Money and SLA values
 * render in mono; active/inactive comes from the canonical semantic registry.
 * Data logic unchanged.
 */
import { useEffect, useState, useCallback } from "react";
import { FleetOSLayout } from "@/components/layout/FleetOSLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@packages/auth";
import {
  FileText, Search, Plus, Building2, ChevronRight,
} from "lucide-react";
import { AddContractDialog } from "@/components/fleet/AddContractDialog";

import { fetchFleetContracts } from "@/application/queries/fleet-contracts.query";
import type { FleetContract } from "@/application/queries/fleet-contracts.query";
import {
  FleetIntro,
  FleetStatusPill,
  FleetListSkeleton,
  FleetError,
} from "@/components/fleet/FleetViewPrimitives";

const FleetContractsPage = () => {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const [contracts, setContracts] = useState<FleetContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<FleetContract | null>(null);

  const loadContracts = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(false);
    try {
      const data = await fetchFleetContracts(userId);
      setContracts(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void Promise.resolve().then(() => loadContracts()); }, [loadContracts]);

  const filtered = contracts.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.fleet_clients?.company_name?.toLowerCase().includes(q)
    );
  });

  const invoiceFreqLabels: Record<string, string> = {
    per_service: "Per service",
    weekly: "Weekly",
    biweekly: "Bi-weekly",
    monthly: "Monthly",
  };

  const activeCount = contracts.filter((c) => c.is_active).length;

  return (
    <FleetOSLayout title="Contracts">
      <div className="space-y-5">
        <FleetIntro
          eyebrow="Agreements"
          description="The pricing, service levels, and approval rules behind each fleet account. One place to see what you promised and what it costs."
          actions={
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> New Contract
            </Button>
          }
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by contract name or company…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-9"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono text-foreground">{contracts.length}</span> contract{contracts.length !== 1 ? "s" : ""} ·{" "}
            <span className="font-mono text-foreground">{activeCount}</span> active
          </p>
        </div>

        {loading ? (
          <FleetListSkeleton rows={4} />
        ) : error ? (
          <FleetError
            title="Couldn't load contracts"
            message="Check your connection and try again. Your contract data is safe."
            onRetry={loadContracts}
          />
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-lg font-semibold">No contracts yet</p>
              <p className="text-sm leading-6 text-muted-foreground mt-1 mb-4">
                Contracts set pricing, service levels, and approval rules for each fleet — so quotes and invoices match what you promised.
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
                className="cursor-pointer transition-colors hover:border-primary/40"
                onClick={() => setEditing(c)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                        </span>
                        <p className="text-sm font-semibold">{c.name}</p>
                        <FleetStatusPill
                          domain="customerLifecycle"
                          status={c.is_active ? "active" : "inactive"}
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 pl-[46px] text-sm text-muted-foreground">
                        {c.fleet_clients?.company_name && (
                          <span className="flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5" /> {c.fleet_clients.company_name}
                          </span>
                        )}
                        {c.sla_hours != null && (
                          <span>
                            SLA <span className="font-mono text-[13px] text-foreground">{c.sla_hours}h</span>
                          </span>
                        )}
                        {c.approval_threshold != null && (
                          <span>
                            Approval over <span className="font-mono text-[13px] text-foreground">${Number(c.approval_threshold).toLocaleString()}</span>
                          </span>
                        )}
                        {c.invoice_frequency && (
                          <span>{invoiceFreqLabels[c.invoice_frequency] || c.invoice_frequency} billing</span>
                        )}
                        {(c.start_date || c.end_date) && (
                          <span className="font-mono text-[13px]">
                            {c.start_date || "?"} → {c.end_date || "ongoing"}
                          </span>
                        )}
                      </div>
                      {c.pricing_rules && c.pricing_rules.length > 0 && (
                        <div className="pl-[46px] mt-2 flex flex-wrap gap-1">
                          {(c.pricing_rules as any[]).slice(0, 3).map((rule: any, i: number) => (
                            <span key={i} className="text-[11px] font-mono bg-muted px-2 py-0.5 rounded-md text-muted-foreground">
                              {rule.service || rule.name}: ${rule.price || rule.amount}
                            </span>
                          ))}
                          {c.pricing_rules.length > 3 && (
                            <span className="text-[11px] text-muted-foreground">
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

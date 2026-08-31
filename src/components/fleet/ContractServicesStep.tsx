import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Package, DollarSign } from "lucide-react";
import { fetchCatalogItems, type CatalogItem } from "@/application/queries/service-catalog.query";
import {
  fetchFleetContractServices,
  type FleetContractServiceRow,
} from "@/application/queries/fleet-contract-services.query";
import {
  attachServiceToContract,
  removeServiceFromContract,
  updateContractService,
} from "@/application/commands/fleet-contract-services.command";
import { toast } from "@/components/ui/sonner";

interface Props {
  contractId: string | null;
  userId: string;
  onChanged?: () => void;
}

interface PendingService {
  service_catalog_id: string;
  name: string;
  default_price: number;
  custom_price: string;
  custom_label: string;
}

export const ContractServicesStep = ({ contractId, userId, onChanged }: Props) => {
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [attachedServices, setAttachedServices] = useState<FleetContractServiceRow[]>([]);
  const [pendingServices, setPendingServices] = useState<PendingService[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);


  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const items = await fetchCatalogItems();
      setCatalogItems(items.filter((i) => i.is_active));

      if (contractId) {
        const attached = await fetchFleetContractServices(contractId);
        setAttachedServices(attached);
      }
    } catch (err) {
      console.error("Failed to load services", err);
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useEffect(() => {
    void Promise.resolve().then(() => loadData());
  }, [contractId, loadData, userId]);

  const attachedCatalogIds = new Set([
    ...attachedServices.map((s) => s.service_catalog_id),
    ...pendingServices.map((s) => s.service_catalog_id),
  ]);

  const filteredCatalog = catalogItems.filter((item) => {
    if (attachedCatalogIds.has(item.id)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      item.category?.toLowerCase().includes(q)
    );
  });

  const togglePending = (item: CatalogItem) => {
    const exists = pendingServices.find((s) => s.service_catalog_id === item.id);
    if (exists) {
      setPendingServices((prev) => prev.filter((s) => s.service_catalog_id !== item.id));
    } else {
      setPendingServices((prev) => [
        ...prev,
        {
          service_catalog_id: item.id,
          name: item.name,
          default_price: item.default_price,
          custom_price: "",
          custom_label: "",
        },
      ]);
    }
  };

  const updatePending = (catalogId: string, field: "custom_price" | "custom_label", value: string) => {
    setPendingServices((prev) =>
      prev.map((s) => (s.service_catalog_id === catalogId ? { ...s, [field]: value } : s)),
    );
  };

  const attachPendingServices = async () => {
    if (!contractId) {
      toast.error("Save the contract first before attaching services.");
      return;
    }

    for (const svc of pendingServices) {
      try {
        await attachServiceToContract(userId, {
          fleet_contract_id: contractId,
          service_catalog_id: svc.service_catalog_id,
          custom_price: svc.custom_price ? parseFloat(svc.custom_price) : null,
          custom_label: svc.custom_label || null,
        });
      } catch (err) {
        toast.error(`Failed to attach ${svc.name}: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    setPendingServices([]);
    toast.success("Services attached to contract");
    await loadData();
    onChanged?.();
  };

  const handleRemove = async (id: string) => {
    try {
      await removeServiceFromContract(id);
      toast.success("Service removed from contract");
      await loadData();
      onChanged?.();
    } catch {
      toast.error("Failed to remove service");
    }
  };

  const handleToggleActive = async (svc: FleetContractServiceRow) => {
    try {
      await updateContractService(svc.id, { is_active: !svc.is_active });
      await loadData();
      onChanged?.();
    } catch {
      toast.error("Failed to update service");
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground py-4 text-center">Loading services...</p>;
  }

  return (
    <div className="space-y-4">
      {/* Already attached services */}
      {attachedServices.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Contract Services ({attachedServices.length})
          </Label>
          <div className="space-y-1">
            {attachedServices.map((svc) => (
              <div
                key={svc.id}
                className="flex items-center justify-between rounded border p-2 text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">
                    {svc.custom_label || svc.service_catalog?.name || "Service"}
                  </span>
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    {svc.custom_price != null
                      ? `$${Number(svc.custom_price).toFixed(2)}`
                      : `$${Number(svc.service_catalog?.default_price || 0).toFixed(2)} (default)`}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch
                    checked={svc.is_active}
                    onCheckedChange={() => handleToggleActive(svc)}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive h-7 px-2"
                    onClick={() => handleRemove(svc.id)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending services to add */}
      {pendingServices.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Services to Add ({pendingServices.length})
          </Label>
          <div className="space-y-2">
            {pendingServices.map((svc) => (
              <div key={svc.service_catalog_id} className="rounded border p-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{svc.name}</span>
                  <span className="text-xs text-muted-foreground">
                    Default: ${svc.default_price.toFixed(2)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Contract Price</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder={`${svc.default_price.toFixed(2)} (default)`}
                      value={svc.custom_price}
                      onChange={(e) => updatePending(svc.service_catalog_id, "custom_price", e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Custom Label</Label>
                    <Input
                      placeholder={svc.name}
                      value={svc.custom_label}
                      onChange={(e) => updatePending(svc.service_catalog_id, "custom_label", e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          {contractId && (
            <Button size="sm" onClick={attachPendingServices}>
              <DollarSign className="h-3.5 w-3.5 mr-1" /> Attach {pendingServices.length} Service{pendingServices.length !== 1 ? "s" : ""}
            </Button>
          )}
        </div>
      )}

      {/* Browse available services */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Browse Platform Services
        </Label>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search services..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <ScrollArea className="max-h-48">
          {filteredCatalog.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3 text-center">
              {catalogItems.length === 0 ? "No platform services configured yet." : "All services are already attached or no matches found."}
            </p>
          ) : (
            <div className="space-y-1">
              {filteredCatalog.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 rounded border p-2 cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => togglePending(item)}
                >
                  <Checkbox
                    checked={pendingServices.some((s) => s.service_catalog_id === item.id)}
                    className="shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{item.name}</span>
                      {item.category && (
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {item.category}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    ${item.default_price.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {!contractId && pendingServices.length > 0 && (
        <p className="text-xs text-muted-foreground bg-muted p-2 rounded">
          Save the contract first, then return to attach selected services.
        </p>
      )}
    </div>
  );
};

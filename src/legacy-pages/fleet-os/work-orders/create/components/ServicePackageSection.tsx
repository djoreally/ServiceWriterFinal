import { useMemo } from "react";
import type { Dispatch } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardList, AlertTriangle } from "lucide-react";
import type { FleetWorkOrderCreateOptions } from "@/application/queries";
import type { WorkOrderDraftAction, WorkOrderDraftState } from "../state/workOrderReducer";
import type { DraftServicePackage } from "@/application/commands/fleet-work-order-draft.command";

// Sensible default catalog used when a customer has no service_rules configured yet.
const FALLBACK_CATALOG: DraftServicePackage[] = [
  {
    code: "basic_pm",
    label: "Basic PM",
    base_price_per_vehicle: 89,
    estimated_duration_minutes: 45,
    includes: ["Full Synthetic Oil", "Oil Filter", "Multi-Point Inspection", "Fluid Top-Off"],
  },
  {
    code: "premium_pm",
    label: "Premium PM",
    base_price_per_vehicle: 149,
    estimated_duration_minutes: 75,
    includes: ["Full Synthetic Oil", "OEM Filter", "Tire Rotation", "Brake Inspection", "Battery Test"],
  },
  {
    code: "diesel_service",
    label: "Diesel Service",
    base_price_per_vehicle: 249,
    estimated_duration_minutes: 90,
    includes: ["Diesel-Rated Oil", "Fuel Filter", "Air Filter", "DEF Top-Off", "DPF Inspection"],
  },
];

interface Props {
  state: WorkOrderDraftState;
  dispatch: Dispatch<WorkOrderDraftAction>;
  options: FleetWorkOrderCreateOptions | null;
}

export const ServicePackageSection = ({ state, dispatch, options }: Props) => {
  // Contract-tier pricing overlay: match by service_catalog name against pkg code/label,
  // or by custom_label. Falls back to base_price when no override.
  const contractPriceFor = (pkg: DraftServicePackage): number | null => {
    if (!state.contract || !options) return null;
    const overrides = options.contractServices.filter(
      (cs) => cs.fleet_contract_id === state.contract!.id && cs.is_active,
    );
    const match = overrides.find(
      (cs) =>
        cs.custom_label === pkg.code ||
        cs.custom_label === pkg.label ||
        cs.catalog_name === pkg.label ||
        cs.catalog_name === pkg.code,
    );
    if (!match) return null;
    return match.custom_price ?? match.catalog_default_price ?? null;
  };

  const contractHasNoServices = useMemo(() => {
    if (!state.contract || !options) return false;
    const overrides = options.contractServices.filter(
      (cs) => cs.fleet_contract_id === state.contract!.id && cs.is_active,
    );
    return overrides.length === 0;
  }, [state.contract, options]);

  const packages = useMemo<DraftServicePackage[]>(() => {
    // 1) Prefer contract services (per-client pricing tier) when a contract is selected.
    if (state.contract && options?.contractServices?.length) {
      const contractPkgs = options.contractServices
        .filter((cs) => cs.fleet_contract_id === state.contract!.id && cs.is_active)
        .map<DraftServicePackage>((cs) => {
          const label = cs.custom_label || cs.catalog_name || "Contract Service";
          const price = Number(cs.custom_price ?? cs.catalog_default_price ?? 0);
          return {
            code: cs.service_catalog_id || cs.id,
            label,
            base_price_per_vehicle: price,
            estimated_duration_minutes: 60,
            includes: [label],
          };
        });
      if (contractPkgs.length > 0) return contractPkgs;
    }

    // 2) If a contract is selected but has no services, DON'T silently show fallback catalog.
    if (state.contract && contractHasNoServices) return [];

    // 3) Fall back to client-scoped service_rules profiles.
    const rules = options?.serviceProfiles ?? [];
    const scoped = state.customer
      ? rules.filter((r) => r.fleet_client_id === state.customer!.id)
      : [];
    if (scoped.length === 0) return FALLBACK_CATALOG;
    return scoped.map((r) => ({
      code: r.package_code ?? r.service_class,
      label: r.package_label ?? r.service_class.replace(/_/g, " "),
      base_price_per_vehicle: Number(r.base_price ?? 0),
      estimated_duration_minutes: r.estimated_duration_minutes ?? 60,
      includes: r.includes.length > 0 ? r.includes : [r.base_labor_package],
      base_labor_service_package: r.base_labor_package,
    }));
  }, [options, state.customer, state.contract, contractHasNoServices]);


  const disabled = state.vehicles.length === 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-indigo-500" /> 4. Service Package
        </CardTitle>
      </CardHeader>
      <CardContent>
        {disabled && (
          <p className="text-xs text-muted-foreground">Select vehicles first.</p>
        )}
        {!disabled && state.contract && contractHasNoServices && (
          <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-amber-900 dark:text-amber-200">
                  Contract "{state.contract.name || "Fleet Agreement"}" has no services attached.
                </p>
                <p className="text-amber-800/80 dark:text-amber-200/80 mt-0.5">
                  Add pricing tiers to this contract, or remove it from the customer so the
                  standard catalog is used instead.
                </p>
              </div>
            </div>
            <div className="flex gap-2 pl-6">
              <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                <Link to={`/fleet-os/contracts?edit=${state.contract.id}`}>
                  Add contract services
                </Link>
              </Button>
              <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                <Link to="/fleet-os/contracts">Pick another contract</Link>
              </Button>
            </div>
          </div>
        )}
        {!disabled && packages.length > 0 && (
          <div className="grid gap-2 md:grid-cols-3">
            {packages.map((pkg) => {
              const selected = state.servicePackage?.code === pkg.code;
              const override = contractPriceFor(pkg);
              const effectivePrice = override ?? pkg.base_price_per_vehicle;
              return (
                <button
                  key={pkg.code}
                  type="button"
                  onClick={() =>
                    dispatch({
                      type: "SET_PACKAGE",
                      pkg: override != null
                        ? { ...pkg, base_price_per_vehicle: override }
                        : pkg,
                    })
                  }
                  className={`text-left rounded-md border p-3 text-sm transition ${
                    selected ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30" : "hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{pkg.label}</span>
                    <div className="flex flex-col items-end">
                      <span className="text-sm font-bold">${effectivePrice}</span>
                      {override != null && override !== pkg.base_price_per_vehicle && (
                        <span className="text-[10px] text-muted-foreground line-through">
                          ${pkg.base_price_per_vehicle}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                    {pkg.estimated_duration_minutes} min · per vehicle
                    {override != null && (
                      <span className="ml-auto text-[10px] font-medium text-emerald-600 bg-emerald-500/10 px-1.5 rounded">
                        Contract price
                      </span>
                    )}
                  </div>
                  <ul className="mt-2 space-y-0.5 text-xs">
                    {pkg.includes.map((i) => (
                      <li key={i}>• {i}</li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

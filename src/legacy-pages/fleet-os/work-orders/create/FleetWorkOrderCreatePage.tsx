import { useEffect, useMemo, useReducer, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { FleetOSLayout } from "@/components/layout/FleetOSLayout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { fetchFleetWorkOrderCreateOptions, type FleetWorkOrderCreateOptions } from "@/application/queries";
import { fetchDraft, promoteDraft } from "@/application/commands/fleet-work-order-draft.command";
import { useAuth } from "@packages/auth";

import {
  initialWorkOrderDraft,
  workOrderDraftReducer,
} from "./state/workOrderReducer";
import { useWorkOrderDraft } from "./hooks/useWorkOrderDraft";
import { isDraftPromotable, useWorkOrderValidation } from "./hooks/useWorkOrderValidation";

import { CustomerSection } from "./components/CustomerSection";
import { LocationSection } from "./components/LocationSection";
import { VehiclesSection } from "./components/VehiclesSection";
import { ServicePackageSection } from "./components/ServicePackageSection";
import { ScheduleSection } from "./components/ScheduleSection";
import { ContractBillingSection } from "./components/ContractBillingSection";
import { NotesSection } from "./components/NotesSection";
import { AttachmentsSection } from "./components/AttachmentsSection";
import { WorkOrderSummaryRail } from "./components/WorkOrderSummaryRail";

const FleetWorkOrderCreatePage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [state, dispatch] = useReducer(workOrderDraftReducer, initialWorkOrderDraft);
  const [options, setOptions] = useState<FleetWorkOrderCreateOptions | null>(null);
  const [technicians, setTechnicians] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useWorkOrderValidation(state, dispatch);

  const { persist } = useWorkOrderDraft(state, (id) => dispatch({ type: "SET_DRAFT_ID", id }));

  const draftPersistenceKey = useMemo(
    () => JSON.stringify({
      customerId: state.customer?.id ?? null,
      locationId: state.location?.id ?? null,
      contractId: state.contract?.id ?? null,
      vehicles: state.vehicles,
      servicePackage: state.servicePackage,
      addOns: state.addOns,
      scheduledDate: state.scheduledDate,
      scheduledTime: state.scheduledTime,
      technicianId: state.technicianId,
      assignLater: state.assignLater,
      poNumber: state.poNumber,
      billingMethod: state.billingMethod,
      notes: state.notes,
      sourceType: state.sourceType,
    }),
    [
      state.customer?.id,
      state.location?.id,
      state.contract?.id,
      state.vehicles,
      state.servicePackage,
      state.addOns,
      state.scheduledDate,
      state.scheduledTime,
      state.technicianId,
      state.assignLater,
      state.poNumber,
      state.billingMethod,
      state.notes,
      state.sourceType,
    ],
  );

  useEffect(() => {
    (async () => {
      try {
        const [opts, techRes] = await Promise.all([
          fetchFleetWorkOrderCreateOptions(),
          user?.id
            ? (async () => {
                const { data: ownerId } = await (supabase as any).rpc("current_workspace_owner_user_id");
                return supabase.from("technicians").select("id, name").eq("user_id", String(ownerId || user.id)).eq("is_active", true).order("name");
              })()
            : Promise.resolve({ data: [] as { id: string; name: string }[] } as any),
        ]);
        setOptions(opts);
        setTechnicians((techRes as any).data || []);
      } catch (err) {
        console.error("[FleetWorkOrderCreatePage] load failed", err);
        toast.error("Failed to load work order data");
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id]);

  // Requests convert to a controlled draft first. Hydrate that draft here so
  // dispatch never has to re-enter the confirmed client or vehicle.
  useEffect(() => {
    const draftId = searchParams.get("draft");
    if (!options) return;
    if (!draftId) {
      const vehicleId = searchParams.get("vehicleId");
      const clientId = searchParams.get("clientId") ?? options.vehicles.find((item) => item.id === vehicleId)?.fleet_client_id;
      const client = options.clients.find((item) => item.id === clientId);
      if (client) dispatch({ type: "SET_CUSTOMER", customer: { id: client.id, name: client.company_name } });
      const vehicle = options.vehicles.find((item) => item.id === vehicleId);
      if (vehicle) dispatch({ type: "SET_VEHICLES", vehicles: [{ id: vehicle.id, unit_number: vehicle.unit_number, year: vehicle.year, make: vehicle.make, model: vehicle.model, vin: vehicle.vin }] });
      return;
    }
    let cancelled = false;
    void fetchDraft(draftId).then((saved) => {
      if (!saved || cancelled) return;
      const client = options.clients.find((item) => item.id === saved.customer_id);
      const location = options.locations.find((item) => item.id === saved.location_id);
      dispatch({ type: "SET_DRAFT_ID", id: saved.id });
      if (client) dispatch({ type: "SET_CUSTOMER", customer: { id: client.id, name: client.company_name } });
      if (location) dispatch({ type: "SET_LOCATION", location: { id: location.id, name: location.name || "Location", city: location.city, service_window_start: location.service_window_start, service_window_end: location.service_window_end } });
      dispatch({ type: "SET_VEHICLES", vehicles: Array.isArray(saved.selected_vehicles) ? saved.selected_vehicles : [] });
      if (saved.service_package) dispatch({ type: "SET_PACKAGE", pkg: saved.service_package });
      dispatch({ type: "SET_NOTES", notes: saved.notes || "" });
    }).catch((error) => toast.error(error instanceof Error ? error.message : "Unable to open request draft"));
    return () => { cancelled = true; };
  }, [options, searchParams]);

  // Debounced draft persistence.
  useEffect(() => {
    if (!state.customer) return;
    const handle = setTimeout(() => {
      void persist().catch((e) => console.error("[persist draft]", e));
    }, 800);
    return () => clearTimeout(handle);
  }, [state.customer, draftPersistenceKey, persist]);

  const promotable = isDraftPromotable(state);

  const handleCreate = async () => {
    if (!promotable) {
      toast.error("Resolve blocking validation issues before creating.");
      return;
    }
    setSubmitting(true);
    try {
      const draftId = await persist();
      if (!draftId) throw new Error("Draft could not be saved.");
      // promoteDraft will auto-approve (running server validation + PO check)
      // before fanning out into individual work orders.
      const { createdIds } = await promoteDraft(draftId, { autoApprove: true });
      toast.success(`${createdIds.length} work order${createdIds.length === 1 ? "" : "s"} created`);
      navigate("/fleet-os/work-orders");
    } catch (err) {
      console.error("[FleetWorkOrderCreatePage] promote failed", err);
      toast.error(err instanceof Error ? err.message : "Failed to create work order");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FleetOSLayout title="New Work Order">
      <div className="max-w-7xl">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/fleet-os/work-orders")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-xl font-bold">Controlled Work Order Creation</h2>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-4">
              <CustomerSection state={state} dispatch={dispatch} options={options} />
              <LocationSection state={state} dispatch={dispatch} options={options} />
              <VehiclesSection state={state} dispatch={dispatch} options={options} />
              <ServicePackageSection state={state} dispatch={dispatch} options={options} />
              <ScheduleSection state={state} dispatch={dispatch} technicians={technicians} />
              <ContractBillingSection state={state} dispatch={dispatch} options={options} />
              <NotesSection state={state} dispatch={dispatch} />
              <AttachmentsSection draftId={state.draftId} onRequireDraft={persist} />
            </div>
            <aside>
              <WorkOrderSummaryRail
                state={state}
                onCreate={handleCreate}
                submitting={submitting}
                promotable={promotable}
              />
            </aside>
          </div>
        )}
      </div>
    </FleetOSLayout>
  );
};

export default FleetWorkOrderCreatePage;

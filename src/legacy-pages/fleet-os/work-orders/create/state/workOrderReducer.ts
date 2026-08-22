/**
 * Centralized reducer state for Fleet OS Controlled Work Order Creation.
 * Every left-hand section dispatches into this state; the right-hand
 * Summary Rail is a read-only subscriber.
 */

import type {
  DraftAddOn,
  DraftServicePackage,
  DraftVehicleRef,
  WorkOrderSourceType,
} from "@/application/commands/fleet-work-order-draft.command";

export interface CustomerSummary {
  id: string;
  name: string;
  vehicle_count?: number;
  location_count?: number;
  active_contract?: boolean;
  monthly_revenue?: number;
}

export interface LocationSummary {
  id: string;
  name: string;
  city?: string | null;
  service_window_start?: string | null;
  service_window_end?: string | null;
}

export interface ContractSummary {
  id: string;
  name: string | null;
  sla_hours: number | null;
  pricing_rules: unknown;
  po_required: boolean;
  start_date: string | null;
  end_date: string | null;
  revision: number | null;
}

export interface ValidationEntry {
  key: string;
  type: "customer" | "vehicles" | "contract" | "pricing" | "technician" | "po" | "schedule" | "location";
  passed: boolean;
  blocking: boolean;
  severity: "error" | "warning" | "info";
  message: string;
}

export interface WorkOrderDraftState {
  draftId: string | null;
  customer: CustomerSummary | null;
  location: LocationSummary | null;
  contract: ContractSummary | null;
  vehicles: DraftVehicleRef[];
  servicePackage: DraftServicePackage | null;
  addOns: DraftAddOn[];
  scheduledDate: string;
  scheduledTime: string;
  technicianId: string | null;
  assignLater: boolean;
  poNumber: string;
  billingMethod: string;
  notes: string;
  sourceType: WorkOrderSourceType;
  validation: ValidationEntry[];
}

export const initialWorkOrderDraft: WorkOrderDraftState = {
  draftId: null,
  customer: null,
  location: null,
  contract: null,
  vehicles: [],
  servicePackage: null,
  addOns: [],
  scheduledDate: "",
  scheduledTime: "",
  technicianId: null,
  assignLater: false,
  poNumber: "",
  billingMethod: "invoice",
  notes: "",
  sourceType: "manual",
  validation: [],
};

export type WorkOrderDraftAction =
  | { type: "SET_DRAFT_ID"; id: string | null }
  | { type: "SET_CUSTOMER"; customer: CustomerSummary | null }
  | { type: "SET_LOCATION"; location: LocationSummary | null }
  | { type: "SET_CONTRACT"; contract: ContractSummary | null }
  | { type: "SET_VEHICLES"; vehicles: DraftVehicleRef[] }
  | { type: "TOGGLE_VEHICLE"; vehicle: DraftVehicleRef }
  | { type: "SET_PACKAGE"; pkg: DraftServicePackage | null }
  | { type: "SET_ADDONS"; addOns: DraftAddOn[] }
  | { type: "SET_SCHEDULE"; date?: string; time?: string }
  | { type: "SET_TECHNICIAN"; technicianId: string | null; assignLater?: boolean }
  | { type: "SET_PO"; poNumber: string }
  | { type: "SET_BILLING_METHOD"; method: string }
  | { type: "SET_NOTES"; notes: string }
  | { type: "SET_VALIDATION"; entries: ValidationEntry[] }
  | { type: "RESET" };

export function workOrderDraftReducer(
  state: WorkOrderDraftState,
  action: WorkOrderDraftAction,
): WorkOrderDraftState {
  switch (action.type) {
    case "SET_DRAFT_ID":
      return { ...state, draftId: action.id };
    case "SET_CUSTOMER":
      // switching customer clears downstream context
      if (state.customer?.id === action.customer?.id) return state;
      return {
        ...state,
        customer: action.customer,
        location: null,
        contract: null,
        vehicles: [],
        addOns: [],
        poNumber: "",
      };
    case "SET_LOCATION":
      if (state.location?.id === action.location?.id) return state;
      return { ...state, location: action.location, vehicles: [], addOns: [] };
    case "SET_CONTRACT":
      return { ...state, contract: action.contract };
    case "SET_VEHICLES":
      return { ...state, vehicles: action.vehicles };
    case "TOGGLE_VEHICLE": {
      const exists = state.vehicles.some((v) => v.id === action.vehicle.id);
      const next = exists
        ? state.vehicles.filter((v) => v.id !== action.vehicle.id)
        : [...state.vehicles, action.vehicle];
      // drop add-ons for removed vehicles
      const validIds = new Set(next.map((v) => v.id));
      return {
        ...state,
        vehicles: next,
        addOns: state.addOns.filter((a) => validIds.has(a.vehicle_id)),
      };
    }
    case "SET_PACKAGE":
      return { ...state, servicePackage: action.pkg };
    case "SET_ADDONS":
      return { ...state, addOns: action.addOns };
    case "SET_SCHEDULE":
      return {
        ...state,
        scheduledDate: action.date ?? state.scheduledDate,
        scheduledTime: action.time ?? state.scheduledTime,
      };
    case "SET_TECHNICIAN":
      return {
        ...state,
        technicianId: action.technicianId,
        assignLater: action.assignLater ?? (action.technicianId ? false : state.assignLater),
      };
    case "SET_PO":
      return { ...state, poNumber: action.poNumber };
    case "SET_BILLING_METHOD":
      return { ...state, billingMethod: action.method };
    case "SET_NOTES":
      return { ...state, notes: action.notes };
    case "SET_VALIDATION":
      return { ...state, validation: action.entries };
    case "RESET":
      return initialWorkOrderDraft;
    default:
      return state;
  }
}

// ---------- Pricing resolver (client-side preview) ----------

export interface EstimateBreakdown {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
}

export function computeEstimate(state: WorkOrderDraftState): EstimateBreakdown {
  const pkg = state.servicePackage;
  const perVehicle = pkg ? Number(pkg.base_price_per_vehicle || 0) : 0;
  const vehicleSubtotal = perVehicle * state.vehicles.length;
  const addOnSubtotal = state.addOns.reduce((sum, a) => sum + Number(a.price || 0), 0);
  const subtotal = vehicleSubtotal + addOnSubtotal;
  const discount = 0;
  const tax = 0;
  const total = Math.max(0, subtotal - discount + tax);
  return { subtotal, discount, tax, total };
}

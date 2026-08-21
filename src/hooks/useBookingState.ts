/**
 * useBookingState — Centralised state for the public booking flow.
 *
 * ⚡ Performance: Consolidates ~35 useState hooks from PublicBooking.tsx
 *   into a single useReducer. This eliminates cascading re-renders caused
 *   by multiple setState calls in the same handler, batching all state
 *   transitions into one dispatch cycle.
 *
 * Phase 1: State extraction only — no UI changes. PublicBooking.tsx
 * consumes this hook and passes individual values + dispatch down.
 */

import { useReducer, useCallback } from "react";
import { CheckoutErrorType } from "@/components/booking/CheckoutErrors";
import { AppliedCoupon } from "@/components/booking/CouponRedemption";
import type { VehicleData } from "@/components/booking/VehicleEntry";

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export type SelectedBookingService = {
  id: string;
  name: string;
  description: string | null;
  default_price: number;
  estimated_duration: number | null;
  category: string | null;
  category_id?: string | null;
  booking_requirements?: import("@/lib/service-category-policy").BookingRequirement[];
};

export type SelectedBookingPackage = {
  id: string;
  name: string;
  description: string | null;
  package_price: number;
  discount_type: string;
  discount_value: number;
  estimated_duration: number | null;
  services: Array<{ id: string; name: string; quantity: number; price: number }>;
};

export interface VehicleServiceSelection {
  services: SelectedBookingService[];
  package: SelectedBookingPackage | null;
}

export interface BookingState {
  // Step tracking
  step: number;

  // Step 1: Address / Location
  customerAddress: string;
  addressLine2: string;
  city: string;
  state: string;
  zipCode: string;
  locationVerified: boolean;
  verifyingLocation: boolean;
  distanceMessage: string;
  customerCoords: { lat: number; lng: number } | null;
  bookingContextId: string | null;

  // Route-safe slots (backend-generated)
  routeSafeSlots: Array<{ time: string; technicianId: string; routeScore: number }>;

  // Step 2: Vehicles
  vehicles: VehicleData[];

  // Step 3: Services
  selectedServices: SelectedBookingService[];
  selectedPackage: SelectedBookingPackage | null;
  vehicleServiceSelections: Record<string, VehicleServiceSelection>;
  serviceViewMode: "services" | "packages" | "subscriptions";

  // Step 4: Date & Time
  selectedDate: Date | undefined;
  selectedTime: string;
  bookedSlots: Array<{ scheduled_time: string; duration_minutes: number }>;
  loadingSlots: boolean;

  // Step 6: Contact & Checkout
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  notes: string;
  paymentChoice: "pay_now" | "pay_later";
  transactionalSmsConsent: boolean;
  marketingSmsConsent: boolean;
  marketingEmailConsent: boolean;
  processingPayment: boolean;
  submitting: boolean;
  lastSubmissionTime: number;
  submissionCount: number;

  // Checkout error
  checkoutError: { type: CheckoutErrorType; message?: string } | null;

  // Customer account flow
  emailVerified: boolean;
  showAuthDialog: boolean;
  authMode: "signin" | "signup";

  // Tax
  taxLoading: boolean;
  taxData: {
    tax_amount: number;
    total: number;
    tax_breakdown: Array<{ jurisdiction: string; rate: number; amount: number }>;
  } | null;

  // Rewards
  selectedRewardInstanceId: string | null;

  // Coupon
  appliedCoupon: AppliedCoupon | null;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type BookingAction =
  | { type: "SET_STEP"; step: number }
  // Address
  | { type: "SET_ADDRESS_FIELD"; field: "customerAddress" | "addressLine2" | "city" | "state" | "zipCode"; value: string }
  | { type: "SET_LOCATION_VERIFIED"; verified: boolean; message?: string; coords?: { lat: number; lng: number } | null; contextId?: string | null }
  | { type: "SET_VERIFYING_LOCATION"; verifying: boolean }
  | { type: "SET_DISTANCE_MESSAGE"; message: string }
  | { type: "SET_CUSTOMER_COORDS"; coords: { lat: number; lng: number } | null }
  | { type: "SET_BOOKING_CONTEXT_ID"; id: string | null }
  // Route-safe slots
  | { type: "SET_ROUTE_SAFE_SLOTS"; slots: BookingState["routeSafeSlots"] }
  // Vehicles
  | { type: "SET_VEHICLES"; vehicles: VehicleData[] }
  // Services
  | { type: "SET_VEHICLE_SERVICE_SELECTION"; vehicleId: string; selection: VehicleServiceSelection }
  | { type: "SET_VEHICLE_SERVICE_SELECTIONS"; selections: Record<string, VehicleServiceSelection> }
  | { type: "SET_SELECTED_SERVICES"; services: BookingState["selectedServices"] }
  | { type: "TOGGLE_SERVICE"; service: BookingState["selectedServices"][0] }
  | { type: "SET_SELECTED_PACKAGE"; pkg: BookingState["selectedPackage"] }
  | { type: "SELECT_PACKAGE"; pkg: NonNullable<BookingState["selectedPackage"]> }
  | { type: "SET_SERVICE_VIEW_MODE"; mode: "services" | "packages" | "subscriptions" }
  // Date & Time
  | { type: "SET_SELECTED_DATE"; date: Date | undefined }
  | { type: "SET_SELECTED_TIME"; time: string }
  | { type: "SET_BOOKED_SLOTS"; slots: BookingState["bookedSlots"] }
  | { type: "SET_LOADING_SLOTS"; loading: boolean }
  // Contact
  | { type: "SET_GUEST_FIELD"; field: "guestName" | "guestEmail" | "guestPhone" | "notes"; value: string }
  | { type: "SET_PAYMENT_CHOICE"; choice: "pay_now" | "pay_later" }
  | { type: "SET_CONSENT_FIELD"; field: "transactionalSmsConsent" | "marketingSmsConsent" | "marketingEmailConsent"; value: boolean }
  | { type: "SET_PROCESSING_PAYMENT"; processing: boolean }
  | { type: "SET_SUBMITTING"; submitting: boolean }
  | { type: "RECORD_SUBMISSION" }
  // Checkout error
  | { type: "SET_CHECKOUT_ERROR"; error: BookingState["checkoutError"] }
  // Auth dialog
  | { type: "SET_EMAIL_VERIFIED"; verified: boolean }
  | { type: "SET_SHOW_AUTH_DIALOG"; show: boolean }
  | { type: "SET_AUTH_MODE"; mode: "signin" | "signup" }
  // Tax
  | { type: "SET_TAX_LOADING"; loading: boolean }
  | { type: "SET_TAX_DATA"; data: BookingState["taxData"] }
  // Rewards
  | { type: "SET_SELECTED_REWARD_INSTANCE"; rewardInstanceId: string | null }
  // Coupon
  | { type: "SET_APPLIED_COUPON"; coupon: AppliedCoupon | null }
  // Batch: reset on successful booking
  | { type: "BOOKING_SUCCESS" }
  // Bulk restore from session storage
  | { type: "RESTORE_SESSION"; partial: Partial<BookingState> };

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function bookingReducer(state: BookingState, action: BookingAction): BookingState {
  switch (action.type) {
    case "SET_STEP":
      return { ...state, step: action.step };

    // Address fields
    case "SET_ADDRESS_FIELD":
      return { ...state, [action.field]: action.value };
    case "SET_LOCATION_VERIFIED":
      return {
        ...state,
        locationVerified: action.verified,
        ...(action.message !== undefined && { distanceMessage: action.message }),
        ...(action.coords !== undefined && { customerCoords: action.coords }),
        ...(action.contextId !== undefined && { bookingContextId: action.contextId }),
      };
    case "SET_VERIFYING_LOCATION":
      return { ...state, verifyingLocation: action.verifying };
    case "SET_DISTANCE_MESSAGE":
      return { ...state, distanceMessage: action.message };
    case "SET_CUSTOMER_COORDS":
      return { ...state, customerCoords: action.coords };
    case "SET_BOOKING_CONTEXT_ID":
      return { ...state, bookingContextId: action.id };

    // Route-safe slots
    case "SET_ROUTE_SAFE_SLOTS":
      return { ...state, routeSafeSlots: action.slots };

    // Vehicles
    case "SET_VEHICLES": {
      const nextSelections = { ...state.vehicleServiceSelections };
      for (const vehicle of action.vehicles) {
        if (!nextSelections[vehicle.id]) nextSelections[vehicle.id] = { services: [], package: null };
      }
      return { ...state, vehicles: action.vehicles, vehicleServiceSelections: nextSelections };
    }

    // Services
    case "SET_VEHICLE_SERVICE_SELECTION": {
      const vehicleServiceSelections = { ...state.vehicleServiceSelections, [action.vehicleId]: action.selection };
      const all = Object.values(vehicleServiceSelections);
      return {
        ...state,
        vehicleServiceSelections,
        selectedServices: all.flatMap((selection) => selection.services),
        selectedPackage: all.length === 1 ? all[0]?.package || null : null,
      };
    }
    case "SET_VEHICLE_SERVICE_SELECTIONS": {
      const all = Object.values(action.selections);
      return {
        ...state,
        vehicleServiceSelections: action.selections,
        selectedServices: all.flatMap((selection) => selection.services),
        selectedPackage: all.length === 1 ? all[0]?.package || null : null,
      };
    }
    case "SET_SELECTED_SERVICES": {
      const firstVehicleId = state.vehicles[0]?.id;
      if (!firstVehicleId) return { ...state, selectedServices: action.services };
      const selection: VehicleServiceSelection = { services: action.services, package: null };
      return { ...state, selectedServices: action.services, selectedPackage: null, vehicleServiceSelections: { ...state.vehicleServiceSelections, [firstVehicleId]: selection } };
    }
    case "TOGGLE_SERVICE": {
      const exists = state.selectedServices.find(s => s.id === action.service.id);
      return {
        ...state,
        selectedPackage: null, // Clear package when toggling individual services
        selectedServices: exists
          ? state.selectedServices.filter(s => s.id !== action.service.id)
          : [...state.selectedServices, action.service],
      };
    }
    case "SET_SELECTED_PACKAGE":
      return { ...state, selectedPackage: action.pkg };
    case "SELECT_PACKAGE":
      return {
        ...state,
        selectedServices: [], // Clear individual services when selecting package
        selectedPackage: state.selectedPackage?.id === action.pkg.id ? null : action.pkg,
      };
    case "SET_SERVICE_VIEW_MODE":
      return { ...state, serviceViewMode: action.mode };

    // Date & Time
    case "SET_SELECTED_DATE":
      return { ...state, selectedDate: action.date };
    case "SET_SELECTED_TIME":
      return { ...state, selectedTime: action.time };
    case "SET_BOOKED_SLOTS":
      return { ...state, bookedSlots: action.slots };
    case "SET_LOADING_SLOTS":
      return { ...state, loadingSlots: action.loading };

    // Contact
    case "SET_GUEST_FIELD":
      return { ...state, [action.field]: action.value };
    case "SET_PAYMENT_CHOICE":
      return { ...state, paymentChoice: action.choice };
    case "SET_CONSENT_FIELD":
      return { ...state, [action.field]: action.value };
    case "SET_PROCESSING_PAYMENT":
      return { ...state, processingPayment: action.processing };
    case "SET_SUBMITTING":
      return { ...state, submitting: action.submitting };
    case "RECORD_SUBMISSION":
      return {
        ...state,
        lastSubmissionTime: Date.now(),
        submissionCount: state.submissionCount + 1,
      };

    // Checkout error
    case "SET_CHECKOUT_ERROR":
      return { ...state, checkoutError: action.error };

    // Auth
    case "SET_EMAIL_VERIFIED":
      return { ...state, emailVerified: action.verified };
    case "SET_SHOW_AUTH_DIALOG":
      return { ...state, showAuthDialog: action.show };
    case "SET_AUTH_MODE":
      return { ...state, authMode: action.mode };

    // Tax
    case "SET_TAX_LOADING":
      return { ...state, taxLoading: action.loading };
    case "SET_TAX_DATA":
      return { ...state, taxData: action.data };

    // Rewards
    case "SET_SELECTED_REWARD_INSTANCE":
      return { ...state, selectedRewardInstanceId: action.rewardInstanceId };

    // Coupon
    case "SET_APPLIED_COUPON":
      return { ...state, appliedCoupon: action.coupon };

    // Successful booking — reset form state
    case "BOOKING_SUCCESS":
      return {
        ...state,
        step: 6,
        submitting: false,
        processingPayment: false,
        checkoutError: null,
      };

    // Session restore
    case "RESTORE_SESSION":
      return { ...state, ...action.partial };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const createEmptyVehicle = (): VehicleData => ({
  id: crypto.randomUUID(),
  year: "",
  make: "",
  model: "",
  licensePlate: "",
  vin: "",
  mileage: "",
});

/**
 * Build initial state, optionally restoring from session storage.
 */
function createInitialState(savedData: Record<string, any> | null, initialStep: number): BookingState {
  return {
    step: initialStep,
    customerAddress: savedData?.customerAddress || "",
    addressLine2: savedData?.addressLine2 || "",
    city: savedData?.city || "",
    state: savedData?.state || "",
    zipCode: savedData?.zipCode || "",
    locationVerified: savedData?.locationVerified || false,
    verifyingLocation: false,
    distanceMessage: savedData?.distanceMessage || "",
    customerCoords: savedData?.customerCoords || null,
    bookingContextId: savedData?.bookingContextId || null,
    routeSafeSlots: [],
    vehicles: savedData?.vehicles || [createEmptyVehicle()],
    selectedServices: savedData?.selectedServices || [],
    selectedPackage: null,
    vehicleServiceSelections: (savedData?.vehicleServiceSelections as Record<string, VehicleServiceSelection> | undefined) || (() : Record<string, VehicleServiceSelection> => {
      const vehicle = (savedData?.vehicles || [createEmptyVehicle()])[0];
      return vehicle ? { [vehicle.id]: { services: savedData?.selectedServices || [], package: null } } : {};
    })() as Record<string, VehicleServiceSelection>,
    serviceViewMode: savedData?.serviceViewMode || "services",
    selectedDate: savedData?.selectedDate ? new Date(savedData.selectedDate) : undefined,
    selectedTime: savedData?.selectedTime || "",
    bookedSlots: [],
    loadingSlots: false,
    guestName: savedData?.guestName || "",
    guestEmail: savedData?.guestEmail || "",
    guestPhone: savedData?.guestPhone || "",
    notes: savedData?.notes || "",
    paymentChoice: savedData?.paymentChoice || "pay_later",
    // Pre-checked: the single booking consent box covers terms + transactional
    // updates. Marketing consents stay opt-in (false) by default.
    transactionalSmsConsent: savedData?.transactionalSmsConsent ?? true,
    marketingSmsConsent: savedData?.marketingSmsConsent ?? false,
    marketingEmailConsent: savedData?.marketingEmailConsent ?? false,
    processingPayment: false,
    submitting: false,
    lastSubmissionTime: 0,
    submissionCount: 0,
    checkoutError: null,
    emailVerified: false,
    showAuthDialog: false,
    authMode: "signin",
    taxLoading: false,
    taxData: null,
    selectedRewardInstanceId: savedData?.selectedRewardInstanceId || null,
    appliedCoupon: null,
  };
}

export function useBookingState(savedData: Record<string, any> | null, initialStep: number) {
  const [state, dispatch] = useReducer(
    bookingReducer,
    { savedData, initialStep },
    ({ savedData, initialStep }) => createInitialState(savedData, initialStep),
  );

  // Convenience dispatchers for the most common operations
  const setStep = useCallback((step: number) => dispatch({ type: "SET_STEP", step }), []);
  const setSelectedTime = useCallback((time: string) => dispatch({ type: "SET_SELECTED_TIME", time }), []);

  return { state, dispatch, setStep, setSelectedTime } as const;
}

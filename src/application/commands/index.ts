/**
 * Application Commands - Public API
 *
 * All application-layer commands should be imported from here.
 * UI components use these to trigger business operations.
 */

export {
  startCheckout,
  type CheckoutRequest,
  type CheckoutResult,
  type CheckoutError,
} from './checkout.command';

export {
  requestAppointmentProviderSync,
  type ProviderSyncMode,
  type ProviderSyncName,
  type RequestAppointmentProviderSyncParams,
} from './provider-sync.command';

export {
  createServiceRecord,
  createServiceRecordFromAppointment,
  completeAppointmentWithServiceRecord,
  updateServiceRecordStatus,
  updateServicePaymentStatus,
  type ServiceRecordData,
  type CreateServiceRecordResult,
  type AppointmentToServiceData,
} from './service-record.command';

export {
  chargeFleetWorkOrder,
  type FleetChargeRequest,
  type FleetChargeResult,
} from './fleet.command';

export {
  createVan,
  type CreateVanPayload,
  createFleetVehicle,
  updateFleetVehicle,
  deleteFleetVehicle,
  type CreateFleetVehiclePayload,
} from './fleet.command';

export {
  createFleetWorkOrder,
  generateWorkOrdersFromApprovedSchedules,
  advanceFleetWorkOrderStatus,
  completeFleetWorkOrderWithDetails,
  authorizePurchaseOrderForWorkOrder,
  applyFleetInvoiceAdjustment,
  recordFleetInvoicePayment,
  requestFleetWorkOrderApproval,
  addFleetWorkOrderLineItem,
  updateFleetWorkOrderLineItem,
  deleteFleetWorkOrderLineItem,
  updateFleetWorkOrderNotes,
  updateFleetWorkOrderSchedule,
  runFleetSchedulerReconciliation,
  updateFleetWorkOrderDetails,
  createAppointmentFromFleetWorkOrder,
  linkFleetWorkOrderToAppointment,
  type CreateFleetWorkOrderPayload,
  type CreateFleetWorkOrderResult,
  type GenerateWorkOrdersFromSchedulesResult,
  type CompleteFleetWorkOrderPayload,
  type FleetWorkOrderApprovalPayload,
  type AddFleetWorkOrderLineItemPayload,
  type UpdateFleetWorkOrderLineItemPayload,
} from './fleet.command';

export {
  dispatchFleetWorkOrder,
  getFleetDispatchScoreBreakdown,
  assignFleetWorkOrderWithOverride,
  type DispatchScoreBreakdown,
} from './fleet-dispatch.command';

export {
  createCustomer,
  createCustomerAndReturn,
  updateCustomer,
  deleteCustomer,
  type CustomerWritePayload,
} from './customers.command';

export {
  createVehicle,
  updateVehicle,
  deleteVehicle,
  type VehicleWritePayload,
} from './vehicles.command';

export {
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  transferInventoryToVan,
  uploadInventoryImage,
  type InventoryItemWritePayload,
} from './inventory.command';

export {
  saveAppointment,
  tryAutoDispatchAppointment,
  updateAppointmentSchedule,
  updateAppointmentStatus,
  type SaveAppointmentOptions,
  type SaveAppointmentResult,
  type AutoDispatchResult,
} from './appointments.command';

// Onboarding and payment-provider setup.
export {
  checkStripeOnboardingStatus,
  startStripeOnboarding,
} from './onboarding.command';

// Canonical Service Writer payments.
export {
  refundPayment,
  sendInvoiceForPayment,
  sendPaymentLink,
  recordManualPayment,
  ensureBookingPaymentVerified,
  type RefundPaymentRequest,
  type PaymentLinkRequest,
  type PaymentLinkResult,
  type ManualPaymentRequest,
} from './payments.command';

// Canonical service catalog.
export {
  createCatalogItem,
  updateCatalogItem,
  deleteCatalogItem,
  toggleCatalogItemActive,
  swapCatalogSortOrder,
  type CatalogItemWritePayload,
} from './catalog.command';

// Service packages.
export {
  createServicePackage,
  updateServicePackage,
  deleteServicePackage,
  toggleServicePackageActive,
  loadTemplatePackages,
  type PackageFormPayload,
  type PackageItemPayload,
} from './packages.command';

// Unified Service Writer Dispatch / Command Center.
export {
  assignDispatchJob,
  autoDispatchPublicBooking,
  assignTechnician,
  assignWorkOrderTechnician,
  unassignAppointment,
  unassignWorkOrder,
  assignVan,
  unassignFleetWorkOrder,
  type DispatchAssignmentInput,
} from './dispatch.command';

// Technician work-order execution compatibility commands.
export {
  advanceChecklistStep,
  captureWorkOrderVin,
  captureWorkOrderMileage,
  updateChecklistItem,
} from './work-order.command';

// Retention compatibility surface still referenced by the preserved UI.
export { saveLoyaltyProgram } from './loyalty.command';

// Legacy Fleet compatibility exports. Fleet is a separate product, but these
// modules remain in the preserved bundle graph until the final App.tsx split.
export {
  fetchFleetClientOptionsForContact,
  createFleetContact,
  updateFleetContact,
  deleteFleetContact,
  type FleetContactPayload,
} from './fleet-contact.command';
export { deleteFleetLocation } from './fleet-location.command';
export { deleteFleetContract } from './fleet-contract.command';
export { deletePurchaseOrder } from './fleet-purchase-order.command';
export {
  createFleetJobFromWorkOrders,
  assignFleetJob,
  type CreateFleetJobResult,
} from './fleet-jobs.command';
export { decodeVinNumber } from './vin.command';

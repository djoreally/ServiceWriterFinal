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

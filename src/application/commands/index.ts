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
  decodeVinNumber,
  ocrVinFromImage,
  type VinDecodeResult,
} from './vin.command';

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
  updateAppointmentStatus,
  type SaveAppointmentOptions,
  type SaveAppointmentResult,
  type AutoDispatchResult,
} from './appointments.command';

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

export {
  sendSmsMessage,
  type SendSmsParams,
  type SendSmsResult,
} from './sms.command';

export {
  createSubscriptionPlan,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
  togglePlanActive,
  syncPlanToStripe,
  syncAllPlansToStripe,
  createSubscriptionCheckout,
  manageSubscription,
  type CreatePlanPayload,
  type UpdatePlanPayload,
  type SyncPlanResult,
  type SyncAllResult,
  type SubscriptionCheckoutRequest,
  type SubscriptionCheckoutResult,
  type ManageSubscriptionRequest,
  type ManageSubscriptionResult,
} from './subscriptions.command';

export {
  createCatalogItem,
  updateCatalogItem,
  deleteCatalogItem,
  toggleCatalogItemActive,
  swapCatalogSortOrder,
  type CatalogItemWritePayload,
} from './catalog.command';

export {
  createServicePackage,
  updateServicePackage,
  deleteServicePackage,
  toggleServicePackageActive,
  loadTemplatePackages,
  type PackageFormPayload,
  type PackageItemPayload,
} from './packages.command';

export {
  assignDispatchJob,
  autoDispatchPublicBooking,
  assignTechnician,
  assignVan,
  unassignAppointment,
  unassignFleetWorkOrder,
  type DispatchAssignmentInput,
} from './dispatch.command';

export {
  updateVan,
  addVanTerritory,
  bulkAddVanTerritories,
  removeVanTerritory,
  toggleTerritoryPrimary,
  restockVan,
  addVanInventoryItem,
  decodeVin,
  type UpdateVanPayload,
} from './van-detail.command';

export {
  recordCheckIn,
  type CheckInParams,
} from './fleet-checkin.command';

export {
  createPurchaseOrder,
  updatePurchaseOrder,
  deletePurchaseOrder,
  fetchFleetClientOptions,
  type CreatePurchaseOrderPayload,
} from './fleet-purchase-order.command';

export {
  fetchServiceImages,
  uploadServiceImage,
  deleteServiceImage,
  type ServiceImage,
} from './service-images.command';

export {
  saveCarfaxSettings,
  recordCarfaxExport,
  fetchCarfaxExportServices,
} from './carfax.command';

export {
  updateTestimonialStatus,
  toggleTestimonialFeatured,
} from './marketing.command';

export {
  createInspectionTemplate,
  updateInspectionTemplate,
  deleteInspectionTemplate,
  toggleInspectionTemplateActive,
  addInspectionItem,
  deleteInspectionItem,
  type TemplatePayload,
  type ItemPayload,
} from './inspections.command';

export {
  fetchFleetClientOptionsForContact,
  createFleetContact,
  updateFleetContact,
  deleteFleetContact,
  type FleetContactPayload,
} from './fleet-contact.command';

export {
  checkStripeOnboardingStatus,
  startStripeOnboarding,
  type StripeOnboardingStatus,
} from './onboarding.command';

export {
  saveLoyaltyProgram,
  type LoyaltyProgramPayload,
} from './loyalty.command';

export {
  seedLoyaltyTemplate,
  type SeedTemplateResult,
} from './loyalty-template.command';

export {
  seedAutomationTemplate,
  dryRunAutomationRule,
  type SeedAutomationResult,
  type DryRunRuleResult,
  type DryRunActionResult,
} from './automation-template.command';

export {
  trackBookingProgress,
  markBookingRecovered,
  type TrackBookingProgressInput,
} from './booking-tracker.command';

export {
  createWorkOrder,
  advanceWorkOrderStatus,
  completeWorkOrder,
  updateChecklistItem,
  type CreateWorkOrderPayload,
  type CreateWorkOrderResult,
  type WorkOrderStatus,
} from './work-order.command';

export {
  createPlaybook,
  updatePlaybook,
  deletePlaybook,
  togglePlaybookActive,
  fetchPlaybooks,
  type PlaybookPayload,
  type PlaybookStep,
} from './playbooks.command';

export {
  reserveInventory,
  consumeReservation,
  releaseReservation,
  releaseWorkOrderReservations,
  fetchWorkOrderReservations,
  fetchInventoryShortages,
  type ReserveInventoryPayload,
  type ReservationResult,
} from './inventory-reservations.command';

export {
  seedPlaybooksFromTemplates,
} from './playbook-seed.command';

export {
  createDispatchRun,
  addRouteStop,
  advanceDispatchRunStatus,
  advanceRouteStopStatus,
  optimizeRunRoute,
  type CreateDispatchRunPayload,
  type AddRouteStopPayload,
  type DispatchRunResult,
} from './dispatch-runs.command';

export {
  insertFleetLocation,
  updateFleetLocation,
  deleteFleetLocation,
} from './fleet-location.command';

export {
  fetchFleetClientsForContract,
  createFleetContract,
  updateFleetContract,
  deleteFleetContract,
  type FleetContractPayload,
} from './fleet-contract.command';

export {
  startMessagingAddonCheckout,
} from './billing-settings.command';

export {
  upsertPhoneCouponOverride,
  deletePhoneCouponOverride,
  type PhoneCouponOverrideInput,
} from './phone-coupons.command';

export {
  updateReceptionistConfig,
  deprovisionReceptionist,
  type ReceptionistUpdatePayload,
} from './receptionist.command';

export {
  upsertSmsPreferences,
} from './sms-preferences.command';

export {
  updateVoiceAgentSettings,
  invokeVoiceBookingTool,
  fetchVoiceConversationToken,
  type VoiceBookingToolResult,
  type VoiceTokenResponse,
} from './voice-agent.command';

export {
  recordBookingConsent,
  type RecordBookingConsentParams,
} from './customer-messaging.command';

export {
  retryQueuedEmail,
  invokeRetentionWorker,
} from './retention-verification.command';

export {
  createFleetJobFromWorkOrders,
  assignFleetJob,
  type CreateFleetJobResult,
} from './fleet-jobs.command';

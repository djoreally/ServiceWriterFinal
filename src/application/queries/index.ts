/**
 * Application Queries Layer
 * 
 * All read operations should go through this layer.
 * UI components call these queries instead of accessing data directly.
 */

export { 
  fetchServices, 
  fetchServiceById,
  type ServiceCatalogItem 
} from './services.query';

export { 
  fetchAvailability, 
  fetchBookedSlots,
  type AvailabilitySlot,
  type BookedSlot 
} from './availability.query';

export {
  fetchTenantProfile,
  type TenantProfileData
} from './tenant.query';

export {
  fetchBookingProfile,
  fetchServicePackages,
  fetchBookedSlots as fetchBookingSlots,
  subscribeToAppointments,
  type BookingBusinessProfile,
  type ServicePackage,
  type ServicePackageItem,
} from './booking.query';

export {
  fetchBusinessSettings,
  saveBusinessSettings,
  checkSlugAvailability,
  type BusinessProfileSettings,
} from './settings.query';

export * from './fleet-ops-dashboard.query';

export {
  fetchFleetDashboardData,
  fetchFleetWorkOrders,
  fetchFleetWorkOrdersPage,
  fetchFleetSchedulerWindow,
  subscribeToFleetScheduler,
  subscribeToFleetList,
  type FleetSchedulerWindow,
  fetchFleetVansOverview,
  type FleetDashboardData,
  type FleetDashboardStats,
  type FleetWorkOrderSummary,
  type FleetWorkOrderPageResult,
  type FleetWorkOrderStatus,
  type FleetVanSummary,
  type FleetTechnicianSummary,
  fetchFleetClients,
  fetchFleetVehiclesList,
  fetchFleetVehiclesPage,
  fetchFleetVehicleFormOptions,
  type FleetClientSummary,
  type FleetVehicleListItem,
  type FleetVehiclePageOptions,
  type FleetVehiclePageResult,
  type FleetVehicleFormOptions,
  fetchFleetWorkOrderCreateOptions,
  fetchFleetVehicleEligibility,
  type FleetVehicleEligibility,
  fetchFleetWorkOrderDetail,
  fetchAssignableTechnicians,
  fetchFleetDomainSeparationHealth,
  type FleetWorkOrderCreateOptions,
  type FleetWorkOrderDetailResult,
  type FleetWorkOrderDetail,
  type FleetWorkOrderLineItem,
  type FleetActivityLog,
  type FleetApproval,
  fetchFleetLocations,
  fetchFleetPurchaseOrders,
  fetchFleetContacts,
  fetchFleetContracts as fetchFleetContractsSummary,
  fetchFleetInvoices,
  fetchFleetReportsOverview,
  fetchFleetTodayWorkOrdersWithCheckins,
  type FleetLocationSummary,
  type FleetPurchaseOrderSummary,
  type FleetContactSummary,
  type FleetContractSummary,
  type FleetInvoiceSummary,
  type FleetReportsOverviewResult,
  type FleetReportStats,
  type FleetTopVehicleSpend,
  type FleetTodayWorkOrdersResult,
  type FleetCheckInRecord as FleetCheckInRecordLegacy,
  type FleetDomainSeparationHealth,
} from './fleet.query';

export {
  fetchFleetJobDetail,
  type FleetJobDetail,
} from './fleet-jobs.query';

export {
  fetchDashboardOverview,
  fetchDashboardReporting,
  fetchDashboardOnboardingInfo,
  type DashboardStats,
  type ActiveService,
  type UpcomingAppointment,
  type PreviousPeriodPayment,
  type PaymentRecord as DashboardPaymentRecord,
  type ServiceRecord,
  type AppointmentRecord,
  type DashboardDateRange,
  type DashboardReportingResult,
  type DashboardOnboardingInfo,
} from './dashboard.query';

export {
  fetchDashboardCockpit,
  type CockpitData,
  type CockpitAppointment,
  type CockpitJobInProgress,
  type CockpitServiceTypeRev,
} from './dashboard-cockpit.query';

export {
  fetchCustomerOverview,
  type CustomerOverviewResult,
} from './customers.query';

export {
  fetchVehicleOverview,
  type VehicleOverviewResult,
} from './vehicles.query';

export {
  fetchInventoryOverview,
  type InventoryOverviewResult,
  type InventoryItem,
  type Van,
  type VanInventoryLink,
} from './inventory.query';

export {
  fetchAppointmentsPageData,
  type AppointmentWithSource,
  type AppointmentsPageData,
  type AppointmentsPageErrors,
} from './appointments.query';

export {
  fetchSmsMessages,
  type SmsMessage,
  fetchSmsEligibleRecipients,
  type SmsRecipient,
} from './sms.query';

export {
  fetchPaymentRecords,
  fetchStripeAccountStatus,
  fetchPaymentSuccessBookingDetails,
  type PaymentRecord,
  type StripeAccountStatus,
  type PaymentSuccessBookingDetails,
} from './payments.query';

export {
  geocodeAddress,
  getDrivingRoute,
  type GeocodeOptions,
  type GeocodeResult,
  type DrivingRouteInput,
  type RouteResult,
} from './mapbox';

export {
  fetchSubscriptionPlans,
  fetchSubscriptionPlansByTier,
  fetchCorePlans,
  fetchAddonPlans,
  fetchSubscriptionPlan,
  fetchPlanTemplates,
  fetchCustomerSubscriptions,
  fetchCustomerSubscriptionsByCustomer,
  fetchPublicSubscriptionPlans,
  fetchSubscriptionStats,
  type SubscriptionStats,
} from './subscriptions.query';

export {
  fetchCatalogItems,
  fetchServiceCategories,
  type CatalogItem,
  type ServiceCategory,
} from './service-catalog.query';

export {
  fetchServiceRecordsPageData,
  type ServiceRecordRow,
  type ServiceRecordsPageData,
} from './service-records.query';

export {
  fetchFleetMapData,
  type FleetMapVan,
} from './fleet-map.query';

export {
  fetchServiceDetail,
  type ServiceDetailData,
  type ServiceDetailCustomer,
  type ServiceDetailVehicle,
  type ServiceDetailLaborItem,
  type ServiceDetailTimelineEvent,
  type ServiceDetailResult,
} from './service-detail.query';

export {
  fetchServicePackages as fetchPackages,
  fetchPackageServiceCatalog,
  type ServicePackageRow,
  type PackageItem as PackageLineItem,
  type PackageServiceItem,
} from './packages.query';

export {
  fetchFleetReportPageData,
  type FleetTopVehicleSpendItem,
  type FleetReportPageData,
  type FleetReportStats as FleetReportPageStats,
} from './fleet-reports.query';

export {
  fetchDispatchBoardData,
  subscribeToDispatchChanges,
  type DispatchTechnician,
  type DispatchVan,
  type DispatchJob,
  type DispatchBoardData,
} from './dispatch.query';

export {
  getJobRuntime,
  type TrustContext as JobRuntimeTrustContext,
} from './get-job-runtime.query';

export {
  fetchFleetStatusExportRows,
  type FleetStatusExportRow,
} from './fleet-status-export.query';

export {
  fetchVanDetail,
  type VanDetailData,
  type VanTerritory,
  type VanInventoryItem,
  type VanAppointment,
  type VanTechnician,
  type WarehouseItem,
  type VanDetailResult,
} from './van-detail.query';

export {
  fetchTodayWorkOrders,
  refreshWorkOrders,
  refreshCheckins,
  type FleetCheckInWorkOrder,
  type FleetCheckInRecord,
} from './fleet-checkin.query';

export {
  fetchFleetContracts,
  type FleetContract,
} from './fleet-contracts.query';

export {
  fetchCarfaxSettings,
  fetchCarfaxExports,
  fetchCarfaxDataStats,
  type CarfaxSettingsData,
  type CarfaxExportRecord,
  type CarfaxDataStats,
} from './carfax.query';

export {
  fetchTestimonials,
  fetchBusinessSlug,
  fetchReviewDashboardData,
  fetchMarketingAnalytics,
  fetchLTVData,
  type TestimonialRow,
  type ReviewRequestRow,
  type ReviewAnalyticsData,
  type MarketingAnalyticsResult,
  type LTVCustomer,
  type MonthlyRevenuePoint,
  type LTVDataResult,
} from './marketing.query';

export {
  fetchInspectionTemplates,
  type InspectionTemplate,
  type InspectionItem,
  type InspectionTemplateData,
} from './inspections.query';

export {
  fetchFollowUpAutomationData,
  type FollowUpRule,
  type ScheduledFollowUp,
  type FollowUpAutomationData,
} from './follow-up.query';

export {
  validateCouponCode,
  type ValidatedCoupon,
} from './coupon.query';

export {
  fetchCustomerServiceHistory,
  fetchCustomerPaymentHistory,
  type CustomerServiceRecord,
  type CustomerPaymentRecord,
} from './customer-portal.query';

export {
  fetchAppointmentPayments,
  type AppointmentPaymentRow,
} from './appointment-payments.query';

export {
  fetchWorkOrders,
  fetchWorkOrderDetail,
  fetchTechnicianWorkOrders,
  subscribeWorkOrders,
} from './work-order.query';

export {
  fetchDispatchRuns,
  fetchRouteStops,
  type DispatchRunSummary,
  type RouteStopDetail,
} from './dispatch-runs.query';

export {
  lookupVehicleParts,
  getRequiredFilterTypes,
  FILTER_TYPE_LABELS,
  type VehiclePart,
} from './vehicle-parts.query';

// ── New (post-tranche) modules registered in the barrel ──────────────
export {
  fetchCurrentBusinessBaseCoordinates,
  type BaseServiceCoordinates,
} from './business-profile.query';

export {
  fetchMessagingStats,
  type MessagingStats,
} from './billing-settings.query';

export {
  fetchPhoneCouponData,
  type PhoneCouponData,
  type PhoneCouponCustomer,
  type PhoneCouponOverride,
} from './phone-coupons.query';

export {
  fetchReceptionistProfile,
  type ReceptionistProfile,
} from './receptionist.query';

export {
  fetchSmsPreferences,
  DEFAULT_SMS_PREFERENCES,
  type SmsPreferences,
} from './sms-preferences.query';

export {
  checkHasVoiceAgent,
  fetchVoiceAgentSettings,
} from './voice-agent.query';

export {
  fetchRetentionVerificationSnapshot,
  fetchTodaysCompletedServices,
  fetchExistingRetentionEventAggregateIds,
  type RetentionVerificationSnapshot,
  type RetentionVerificationCounts,
  type RetentionVerificationRow,
  type CompletedServiceForBackfill,
} from './retention-verification.query';

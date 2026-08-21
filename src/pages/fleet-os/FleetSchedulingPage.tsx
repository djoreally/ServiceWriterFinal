import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

/**
 * FleetSchedulingPage — reinstated Fleet OS route surface.
 * Owns all `/fleet-os/*` routes so Fleet workflows remain first-class.
 *
 * Every page is code-split: previously all 25 Fleet pages were statically
 * imported into one enormous chunk, so a single missing/failed asset took the
 * whole Fleet module down ("Failed to fetch dynamically imported module").
 */
const FleetOSDashboard = lazy(() => import("./FleetOSDashboard"));
const FleetClients = lazy(() => import("./FleetClients"));
const FleetClientNew = lazy(() => import("./FleetClientNew"));
const FleetClientDetail = lazy(() => import("./FleetClientDetail"));
const FleetVehiclesPage = lazy(() => import("./FleetVehiclesPage"));
const FleetVehicleProfilePage = lazy(() => import("./FleetVehicleProfilePage"));
const FleetWorkOrdersPage = lazy(() => import("./FleetWorkOrdersPage"));
const FleetWorkOrderCreatePage = lazy(() => import("./work-orders/create/FleetWorkOrderCreatePage"));
const FleetWorkOrderDetailPage = lazy(() => import("./FleetWorkOrderDetailPage"));
const FleetJobDetailPage = lazy(() => import("./FleetJobDetailPage"));
const FleetWorkOrdersInvoicingPage = lazy(() => import("./FleetWorkOrdersInvoicingPage"));
const FleetLocationsPage = lazy(() => import("./FleetLocationsPage"));
const FleetContractsPage = lazy(() => import("./FleetContractsPage"));
const FleetInvoicesPage = lazy(() => import("./FleetInvoicesPage"));
const FleetPurchaseOrdersPage = lazy(() => import("./FleetPurchaseOrdersPage"));
const FleetReportsPage = lazy(() => import("./FleetReportsPage"));
const FleetContactsPage = lazy(() => import("./FleetContactsPage"));
const ImportVehiclesPage = lazy(() => import("./ImportVehiclesPage"));
const FleetCheckInPage = lazy(() => import("./FleetCheckInPage"));
const ClientTrackingPage = lazy(() => import("./ClientTrackingPage"));
const FleetScheduleCalendarPage = lazy(() => import("./FleetScheduleCalendarPage"));
const FleetCommandCenterPage = lazy(() => import("./FleetCommandCenterPage"));
const FleetHelpPage = lazy(() => import("./FleetHelpPage"));
const FleetEmailInboxPage = lazy(() => import("./FleetEmailInboxPage"));
const FleetServiceRequestsPage = lazy(() => import("./FleetServiceRequestsPage"));

const FleetFallback = () => (
  <div className="flex min-h-[50vh] items-center justify-center">
    <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

const FleetSchedulingPage = () => (
  <Suspense fallback={<FleetFallback />}>
    <Routes>
      <Route index element={<FleetOSDashboard />} />
      <Route path="command-center" element={<FleetCommandCenterPage />} />
      <Route path="scheduler" element={<FleetScheduleCalendarPage />} />
      <Route path="clients" element={<FleetClients />} />
      <Route path="clients/new" element={<FleetClientNew />} />
      <Route path="clients/:id" element={<FleetClientDetail />} />
      <Route path="vehicles" element={<FleetVehiclesPage />} />
      <Route path="vehicles/import" element={<ImportVehiclesPage />} />
      <Route path="vehicles/:id" element={<FleetVehicleProfilePage />} />
      <Route path="work-orders" element={<FleetWorkOrdersPage />} />
      <Route path="work-orders/invoicing" element={<FleetWorkOrdersInvoicingPage />} />
      <Route path="work-orders/new" element={<FleetWorkOrderCreatePage />} />
      <Route path="work-orders/:id" element={<FleetWorkOrderDetailPage />} />
      <Route path="jobs/:id" element={<FleetJobDetailPage />} />
      <Route path="locations" element={<FleetLocationsPage />} />
      <Route path="contracts" element={<FleetContractsPage />} />
      <Route path="invoices" element={<FleetInvoicesPage />} />
      <Route path="pos" element={<FleetPurchaseOrdersPage />} />
      <Route path="reports" element={<FleetReportsPage />} />
      <Route path="contacts" element={<FleetContactsPage />} />
      <Route path="email" element={<FleetEmailInboxPage />} />
      <Route path="requests" element={<FleetServiceRequestsPage />} />
      <Route path="checkin" element={<FleetCheckInPage />} />
      <Route path="tracking" element={<ClientTrackingPage />} />
      <Route path="help" element={<FleetHelpPage />} />
      <Route path="*" element={<Navigate to="/fleet-os" replace />} />
    </Routes>
  </Suspense>
);

export default FleetSchedulingPage;

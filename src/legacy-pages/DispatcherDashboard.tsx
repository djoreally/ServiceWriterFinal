import { Navigate } from "react-router-dom";

/**
 * Dispatch and Command Center are one Service Writer operational surface.
 * Keep the legacy dispatcher route as a compatibility redirect only.
 */
export default function DispatcherDashboard() {
  return <Navigate to="/command-center" replace />;
}

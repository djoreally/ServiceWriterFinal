import { Navigate } from "react-router-dom";

/**
 * Fleet OS has moved to its dedicated product/runtime.
 *
 * Service Writer intentionally no longer mounts the legacy embedded Fleet OS
 * implementation. Existing /fleet-os links fail closed back to the Service
 * Writer dashboard instead of executing stale fleet_* schema code.
 */
const FleetSchedulingPage = () => <Navigate to="/dashboard" replace />;

export default FleetSchedulingPage;

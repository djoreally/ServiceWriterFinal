import { Navigate } from "react-router-dom";

/**
 * Fleet dispatch uses the fleet scheduler because work orders require date,
 * start, duration, and optimistic-concurrency context. The generic residential
 * DispatchBoard is appointment-only and must not receive fleet work-order IDs.
 */
const FleetDispatchBoardPage = () => <Navigate to="/fleet-os/scheduler" replace />;

export default FleetDispatchBoardPage;

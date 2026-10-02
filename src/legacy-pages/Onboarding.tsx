import { Navigate } from "react-router-dom";

/**
 * The legacy onboarding wizard is retired.
 *
 * Old onboarding links now land on the simple business-settings setup surface.
 */
const Onboarding = () => <Navigate to="/settings?tab=business&setup=1" replace />;

export default Onboarding;

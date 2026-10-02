import { Navigate } from "react-router-dom";

/**
 * Business onboarding has been sunset.
 *
 * Keep the historical route as a compatibility redirect so old bookmarks and
 * stale links cannot strand authenticated users in the retired wizard.
 */
const Onboarding = () => <Navigate to="/dashboard" replace />;

export default Onboarding;

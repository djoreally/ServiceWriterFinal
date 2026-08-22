import { Navigate, useSearchParams } from "react-router-dom";

/** Preserves old invitation emails without retaining query-token handling in the invite screen. */
export default function LegacyInviteRedirect() {
  const [params] = useSearchParams();
  const token = params.get("token");
  return <Navigate to={token ? `/invite/${encodeURIComponent(token)}` : "/login"} replace />;
}

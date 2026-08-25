import { Navigate } from "react-router-dom";

/**
 * Command Center is the single Service Writer dispatch workspace.
 * The legacy dispatch-monitor route is retained only for old bookmarks/links.
 */
export default function DispatchMonitorPage() {
  return <Navigate to="/command-center" replace />;
}

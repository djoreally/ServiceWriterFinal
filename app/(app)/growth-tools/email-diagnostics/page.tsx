import { redirect } from "next/navigation";

// Legacy SPA route: <Navigate to="/growth-tools?tab=email-testing" replace />
export default function GrowthToolsEmailDiagnosticsRedirectPage() {
  redirect("/crm/growth?tab=email-testing");
}

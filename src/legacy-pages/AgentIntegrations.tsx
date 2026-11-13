import { AppLayout } from "@/components/layout/AppLayout";
import { ApiKeysPanel } from "@/components/integrations/ApiKeysPanel";
import { McpConnectPanel } from "@/components/integrations/McpConnectPanel";

export default function AgentIntegrations() {
  return (
    <AppLayout title="Agent Integrations">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Agent integrations</h2>
          <p className="text-sm text-muted-foreground">
            Issue an API key for this workspace and let an AI assistant check availability, read your schedule,
            customers, and service catalog — and create customers and book appointments — within the scopes you
            grant.
          </p>
        </div>
        <ApiKeysPanel />
        <McpConnectPanel variant="user" />
      </div>
    </AppLayout>
  );
}

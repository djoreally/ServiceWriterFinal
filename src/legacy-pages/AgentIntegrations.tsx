import { AppLayout } from "@/components/layout/AppLayout";
import { McpConnectPanel } from "@/components/integrations/McpConnectPanel";

export default function AgentIntegrations() {
  return (
    <AppLayout title="Agent Integrations">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Agent integrations</h2>
          <p className="text-sm text-muted-foreground">
            Let an AI assistant read your schedule, customers, and service catalog — and create customers — on your
            behalf.
          </p>
        </div>
        <McpConnectPanel variant="user" />
      </div>
    </AppLayout>
  );
}

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Bot, Copy, Check, Lock, ShieldCheck, Info, RefreshCw, Server, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  MCP_CLIENT_GUIDES,
  MCP_CURSOR_SNIPPET,
  MCP_SERVER_TITLE,
  MCP_SERVER_URL,
  MCP_SERVER_VERSION,
  MCP_TOOLS,
  MCP_EDGE_FUNCTION_NAME,
} from "@/lib/mcpConnection";

function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied`);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy — select the text and copy manually");
    }
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Input readOnly value={value} aria-label={label} className="font-mono text-xs sm:text-sm rounded-md" onFocus={(e) => e.currentTarget.select()} />
      <Button type="button" variant="outline" onClick={copy} className="gap-2 rounded-md shrink-0">
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

function ToolList() {
  return (
    <ul className="divide-y rounded-md border">
      {MCP_TOOLS.map((tool) => (
        <li key={tool.name} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{tool.title}</span>
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{tool.name}</code>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{tool.description}</p>
          </div>
          <Badge variant={tool.readOnly ? "secondary" : "default"} className="w-fit rounded-md shrink-0">
            {tool.readOnly ? "Read only" : "Writes data"}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

function DeploymentStatusCard({ variant }: { variant: McpConnectPanelProps["variant"] }) {
  const [status, setStatus] = useState<"loading" | "reachable" | "unreachable" | "error">("loading");
  const [metadata, setMetadata] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch(`${MCP_SERVER_URL}/.well-known/oauth-protected-resource`, {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setMetadata(data);
          setStatus("reachable");
        } else {
          setStatus("unreachable");
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  const badge =
    status === "loading" ? (
      <Badge variant="outline" className="rounded-md gap-1">
        <RefreshCw className="h-3 w-3 animate-spin" />
        Checking…
      </Badge>
    ) : status === "reachable" ? (
      <Badge variant="outline" className="rounded-md gap-1 border-green-500/30 bg-green-500/10 text-green-700">
        <Server className="h-3 w-3" />
        Reachable
      </Badge>
    ) : (
      <Badge variant="outline" className="rounded-md gap-1 border-destructive/30 bg-destructive/10 text-destructive">
        <Info className="h-3 w-3" />
        {status === "unreachable" ? "Not deployed" : "Check failed"}
      </Badge>
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Deployment status
          </span>
          {badge}
        </CardTitle>
        <CardDescription>
          This app is deployed through Vercel + GitHub. The MCP server itself lives on the Supabase backend as the
          Edge Function <code className="rounded bg-muted px-1 py-0.5">{MCP_EDGE_FUNCTION_NAME}</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === "reachable" && metadata && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              The OAuth resource metadata is reachable and reports the resource as:
            </p>
            <pre className="overflow-x-auto rounded-md border bg-muted p-3 text-xs">
              {JSON.stringify(metadata, null, 2)}
            </pre>
          </div>
        )}

        {status === "unreachable" && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Endpoint not deployed yet</AlertTitle>
            <AlertDescription>
              The connection URL is returning a 404. The <code className="rounded bg-muted px-1 py-0.5">agent-api</code>{" "}
              Edge Function is generated from the source MCP server and is deployed by the GitHub Actions workflow. Push
              the latest code to <code className="rounded bg-muted px-1 py-0.5">main</code> and wait for the deploy job
              to finish.
            </AlertDescription>
          </Alert>
        )}

        {variant === "admin" && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-md gap-2"
              onClick={() => {
                window.location.reload();
              }}
            >
              <RefreshCw className="h-4 w-4" />
              Recheck status
            </Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button type="button" variant="outline" className="rounded-md gap-2">
                  <ExternalLink className="h-4 w-4" />
                  Redeploy
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-md">
                <DialogHeader>
                  <DialogTitle>Redeploy the MCP Edge Function</DialogTitle>
                  <DialogDescription>
                    The function is deployed through GitHub Actions. Choose the fastest path for your situation.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 text-sm">
                  <div className="space-y-2">
                    <p className="font-medium">1. Normal path (recommended)</p>
                    <p className="text-muted-foreground">
                      Push or merge the latest code to <code className="rounded bg-muted px-1 py-0.5">main</code>. The
                      CI workflow runs the <code className="rounded bg-muted px-1 py-0.5">sync:agent-api</code> script and
                      then deploys all Edge Functions to Supabase.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="font-medium">2. Manual path</p>
                    <p className="text-muted-foreground">
                      Open the GitHub Actions tab for this repository, open the latest completed CI run on{" "}
                      <code className="rounded bg-muted px-1 py-0.5">main</code>, and click "Re-run all jobs". Make sure
                      the deploy step has the required Supabase secrets:
                    </p>
                    <ul className="list-disc pl-5 text-muted-foreground">
                      <li>
                        <code className="rounded bg-muted px-1 py-0.5">SUPABASE_ACCESS_TOKEN</code>
                      </li>
                      <li>
                        <code className="rounded bg-muted px-1 py-0.5">SUPABASE_PROJECT_REF</code>
                      </li>
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <p className="font-medium">3. Local path</p>
                    <p className="text-muted-foreground">
                      Run <code className="rounded bg-muted px-1 py-0.5">npm run sync:agent-api</code> then{" "}
                      <code className="rounded bg-muted px-1 py-0.5">
                        npx supabase functions deploy agent-api --project-ref hqfimxqsrwknvsuiizlg
                      </code>{" "}
                      from a machine with the Supabase CLI linked to the project.
                    </p>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface McpConnectPanelProps {
  /** "admin" adds operator-facing notes; "user" is the provider-facing walkthrough. */
  variant?: "user" | "admin";
}

export function McpConnectPanel({ variant = "user" }: McpConnectPanelProps) {
  const isPreview =
    typeof window !== "undefined" && /(^|\.)id-preview--|localhost|127\.0\.0\.1/.test(window.location.hostname);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            {MCP_SERVER_TITLE} agent connection
          </CardTitle>
          <CardDescription>
            Connect ChatGPT, Claude, Cursor, or any MCP-compatible assistant to your ServiceWriter workspace. The
            assistant signs in as you and can only see and change what your account is allowed to.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="outline" className="rounded-md gap-1">
              <ShieldCheck className="h-3 w-3" />
              Secured with sign-in (OAuth 2.1)
            </Badge>
            <Badge variant="outline" className="rounded-md">v{MCP_SERVER_VERSION}</Badge>
            <Badge variant="outline" className="rounded-md">{MCP_TOOLS.length} tools</Badge>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Connection URL</p>
            <CopyField value={MCP_SERVER_URL} label="Connection URL" />
            <p className="text-xs text-muted-foreground">
              Paste this into your assistant's "custom connector" or "MCP server" field. There is no API key to copy —
              you approve access by signing in.
            </p>
          </div>

          {isPreview && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Publish first for outside assistants</AlertTitle>
              <AlertDescription>
                You're viewing a preview build. The connection URL works once the app is published, because the
                assistant needs to reach the sign-in screen on your live site.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <DeploymentStatusCard variant={variant} />

      <Card>
        <CardHeader>
          <CardTitle>How to connect</CardTitle>
          <CardDescription>Pick your assistant and follow the steps.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={MCP_CLIENT_GUIDES[0].id}>
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
              {MCP_CLIENT_GUIDES.map((guide) => (
                <TabsTrigger key={guide.id} value={guide.id} className="rounded-md">
                  {guide.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {MCP_CLIENT_GUIDES.map((guide) => (
              <TabsContent key={guide.id} value={guide.id} className="mt-4 space-y-4">
                <ol className="space-y-3">
                  {guide.steps.map((step, index) => (
                    <li key={step} className="flex gap-3 text-sm">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
                        {index + 1}
                      </span>
                      <span className="pt-0.5">{step}</span>
                    </li>
                  ))}
                </ol>
                {guide.id === "cursor" && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Configuration snippet</p>
                    <pre className="overflow-x-auto rounded-md border bg-muted p-3 text-xs">{MCP_CURSOR_SNIPPET}</pre>
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What the assistant can do</CardTitle>
          <CardDescription>
            These are every tool the connection exposes. Nothing outside this list is reachable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToolList />
          <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Every tool call runs as the signed-in user, so an assistant connected by one team member sees only that
              workspace's data. Revoke access at any time by removing the connector in your assistant's settings.
            </span>
          </div>
        </CardContent>
      </Card>

      {variant === "admin" && (
        <Card>
          <CardHeader>
            <CardTitle>Operator notes</CardTitle>
            <CardDescription>For support walkthroughs and incident triage.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              The endpoint is protected by the platform's OAuth 2.1 authorization server with dynamic client
              registration. Clients register themselves; there is no shared secret to distribute.
            </p>
            <p>
              Consent happens on <code className="rounded bg-muted px-1 py-0.5">/.lovable/oauth/consent</code>. If a
              provider reports being bounced back to the dashboard, they were signed out when the approval screen
              opened — have them sign in first, then retry the connect flow.
            </p>
            <p>
              Row-level security applies per connection, so no cross-tenant access is possible even if a provider shares
              the URL. The URL itself is not a credential.
            </p>
            <p>Providers can self-serve these instructions at Settings → Integrations → Agent integrations.</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Troubleshooting</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible>
            <AccordionItem value="bounce">
              <AccordionTrigger>The approval screen sent me back to the dashboard</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                You weren't signed in when the approval screen opened. Sign in to ServiceWriter in the same browser,
                then start the connect flow again from your assistant.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="not-auth">
              <AccordionTrigger>Tools return "Not authenticated"</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                The connection's sign-in expired. Remove the connector in your assistant's settings and add it again
                using the URL above.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="not-found">
              <AccordionTrigger>The connection URL returns a 404</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                The MCP Edge Function is deployed separately from the Vercel frontend. Make sure the latest code is on{" "}
                <code className="rounded bg-muted px-1 py-0.5">main</code> and the GitHub Actions "Deploy edge functions"
                step completed. Admins can click the <strong>Redeploy</strong> button above for the exact commands.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="empty">
              <AccordionTrigger>No tools show up after connecting</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                Confirm the URL ends in <code className="rounded bg-muted px-1 py-0.5">/functions/v1/agent-api</code> and
                that the assistant is using the HTTP (Streamable HTTP) transport, not SSE or a local command.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="empty-results">
              <AccordionTrigger>Tools work but return nothing</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                You're connected with an account that has no records in this workspace. Sign in with the account that
                owns your shop data and reconnect.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="revoke">
              <AccordionTrigger>How do I disconnect?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                Delete the ServiceWriter connector in your assistant's settings. That drops its access immediately; no
                change is needed inside ServiceWriter.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}

export default McpConnectPanel;

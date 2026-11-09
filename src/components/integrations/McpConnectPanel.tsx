import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Bot, Copy, Check, Lock, ShieldCheck, Info, RefreshCw, Server, KeyRound } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { apiClient, ApiClientError } from "@/lib/api-client";
import {
  MCP_AUTH_HEADER_EXAMPLE,
  MCP_CLIENT_GUIDES,
  MCP_CONFIG_SNIPPET,
  MCP_REST_BASE_URL,
  MCP_SERVER_TITLE,
  MCP_SERVER_URL,
  MCP_SERVER_VERSION,
  MCP_TOOLS,
} from "@/lib/mcpConnection";

export function CopyField({ value, label }: { value: string; label: string }) {
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

function SnippetBlock({ value, label }: { value: string; label: string }) {
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
    <div className="space-y-2">
      <pre className="overflow-x-auto rounded-md border bg-muted p-3 text-xs">{value}</pre>
      <Button type="button" variant="outline" size="sm" onClick={copy} className="gap-2 rounded-md">
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? "Copied" : "Copy snippet"}
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

interface McpProbeResult {
  jsonrpc?: string;
  result?: unknown;
  error?: { code?: number; message?: string };
}

type McpStatus = "checking" | "live" | "unreachable" | "failed";

/**
 * Truthful status check: POST tools/list to /api/mcp WITHOUT a key. A live
 * server refuses with the JSON-RPC -32001 "key required" error — that
 * refusal is the healthy signal. (The request travels through the staff
 * API client, whose session token is not an API key, so the probe measures
 * exactly what an uninvited caller gets.)
 */
function McpStatusCard() {
  const [status, setStatus] = useState<McpStatus>("checking");
  const [detail, setDetail] = useState<string | null>(null);

  const check = async () => {
    setStatus("checking");
    setDetail(null);
    try {
      const response = await apiClient.post<McpProbeResult>("/mcp", {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      });
      if (response?.error?.code === -32001) {
        setDetail(response.error.message ?? "A valid Service Writer API key is required");
        setStatus("live");
      } else if (response && (response.result !== undefined || response.error !== undefined)) {
        setDetail("The endpoint answered the probe.");
        setStatus("live");
      } else {
        setDetail("The endpoint answered something unexpected.");
        setStatus("failed");
      }
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 404) {
        setDetail("The MCP route was not found on this deployment.");
        setStatus("unreachable");
      } else {
        setDetail(error instanceof Error ? error.message : "The probe request failed.");
        setStatus("failed");
      }
    }
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await apiClient.post<McpProbeResult>("/mcp", {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
        });
        if (cancelled) return;
        if (response?.error?.code === -32001) {
          setDetail(response.error.message ?? "A valid Service Writer API key is required");
          setStatus("live");
        } else if (response && (response.result !== undefined || response.error !== undefined)) {
          setDetail("The endpoint answered the probe.");
          setStatus("live");
        } else {
          setDetail("The endpoint answered something unexpected.");
          setStatus("failed");
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiClientError && error.status === 404) {
          setDetail("The MCP route was not found on this deployment.");
          setStatus("unreachable");
        } else {
          setDetail(error instanceof Error ? error.message : "The probe request failed.");
          setStatus("failed");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const badge =
    status === "checking" ? (
      <Badge variant="outline" className="rounded-md gap-1">
        <RefreshCw className="h-3 w-3 animate-spin" />
        Checking…
      </Badge>
    ) : status === "live" ? (
      <Badge variant="outline" className="rounded-md gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-700">
        <Server className="h-3 w-3" />
        Live — key required
      </Badge>
    ) : (
      <Badge variant="outline" className="rounded-md gap-1 border-destructive/30 bg-destructive/10 text-destructive">
        <Info className="h-3 w-3" />
        {status === "unreachable" ? "Not reachable" : "Check failed"}
      </Badge>
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Server status
          </span>
          {badge}
        </CardTitle>
        <CardDescription>
          The MCP server runs inside this app — there is no separate function to deploy. This check calls the
          endpoint without a key; a healthy server refuses the call and asks for one.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === "live" && (
          <p className="text-sm text-muted-foreground">
            The server answered the probe with:{" "}
            <code className="rounded bg-muted px-1 py-0.5">{detail ?? "A valid Service Writer API key is required"}</code>{" "}
            — exactly what an uninvited caller should get. Present a valid key and the same endpoint serves the tools
            below.
          </p>
        )}
        {(status === "unreachable" || status === "failed") && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>{status === "unreachable" ? "Endpoint not reachable" : "Status check failed"}</AlertTitle>
            <AlertDescription>
              {detail ?? "The probe did not complete."} If this persists on the live site, the deployment serving
              this page does not include the agent routes — check that the latest code is deployed.
            </AlertDescription>
          </Alert>
        )}
        <Button type="button" variant="outline" className="rounded-md gap-2" onClick={() => void check()}>
          <RefreshCw className="h-4 w-4" />
          Recheck status
        </Button>
      </CardContent>
    </Card>
  );
}

interface McpConnectPanelProps {
  /** "admin" adds operator-facing notes; "user" is the provider-facing walkthrough. */
  variant?: "user" | "admin";
}

export function McpConnectPanel({ variant = "user" }: McpConnectPanelProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            {MCP_SERVER_TITLE} agent connection
          </CardTitle>
          <CardDescription>
            Connect ChatGPT, Claude, Cursor, or any MCP-compatible assistant to this ServiceWriter workspace. The
            assistant authenticates with a workspace API key you issue above — no separate sign-in — and can only do
            what that key's scopes allow.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="outline" className="rounded-md gap-1">
              <KeyRound className="h-3 w-3" />
              Secured with a workspace API key
            </Badge>
            <Badge variant="outline" className="rounded-md">v{MCP_SERVER_VERSION}</Badge>
            <Badge variant="outline" className="rounded-md">{MCP_TOOLS.length} tools</Badge>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Connection URL</p>
            <CopyField value={MCP_SERVER_URL} label="Connection URL" />
            <p className="text-xs text-muted-foreground">
              Paste this into your assistant's "MCP server" settings, together with the Authorization header below.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Authorization header</p>
            <CopyField value={MCP_AUTH_HEADER_EXAMPLE} label="Authorization header" />
            <p className="text-xs text-muted-foreground">
              Replace the placeholder with a key from the API Keys section above. The{" "}
              <code className="rounded bg-muted px-1 py-0.5">x-api-key</code> header with the same value works too.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Configuration snippet</p>
            <SnippetBlock value={MCP_CONFIG_SNIPPET} label="Configuration snippet" />
          </div>
        </CardContent>
      </Card>

      <McpStatusCard />

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
                {guide.id === "config" && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Configuration snippet</p>
                    <SnippetBlock value={MCP_CONFIG_SNIPPET} label="Configuration snippet" />
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Prefer REST?</CardTitle>
          <CardDescription>
            The same key works on the REST agent API — same workspace, same scopes, same booking rules.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">Base URL</p>
            <CopyField value={MCP_REST_BASE_URL} label="REST base URL" />
            <p className="text-xs text-muted-foreground">
              Send the same Authorization header on every call. The workspace comes from the key — there is no
              workspace parameter to aim a key elsewhere.
            </p>
          </div>
          <ul className="divide-y rounded-md border text-sm">
            <li className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between">
              <span>Service catalog</span>
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">GET /catalog</code>
            </li>
            <li className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between">
              <span>Booking rules</span>
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">GET /booking-rules</code>
            </li>
            <li className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between">
              <span>Check availability / open slots</span>
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">POST /availability</code>
            </li>
            <li className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between">
              <span>Appointments</span>
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">GET /appointments</code>
            </li>
            <li className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between">
              <span>Create a booking (catalog prices, rules enforced)</span>
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">POST /bookings</code>
            </li>
            <li className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between">
              <span>Customers, vehicles, locations, invoices</span>
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">GET /customers · /vehicles · /locations · /invoices</code>
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What the assistant can do</CardTitle>
          <CardDescription>
            These are every tool the connection exposes. A tool only runs when the key holds the scope it needs —
            nothing outside this list is reachable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToolList />
          <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Every call runs under the key's workspace and scopes, and every write is stamped with the key's
              integrator name. Revoke a key in the API Keys section above and its access ends immediately.
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
              Keys are per-workspace and stored as SHA-256 hashes only; the raw key exists solely in the one-time
              display at creation. There is no way to view a key again — a lost key is revoked and re-issued.
            </p>
            <p>
              Server error codes worth knowing:{" "}
              <code className="rounded bg-muted px-1 py-0.5">unauthenticated</code> (no or malformed key),{" "}
              <code className="rounded bg-muted px-1 py-0.5">key_revoked</code>,{" "}
              <code className="rounded bg-muted px-1 py-0.5">key_expired</code>,{" "}
              <code className="rounded bg-muted px-1 py-0.5">insufficient_scope</code> (the key lacks the scope the
              call needs), and <code className="rounded bg-muted px-1 py-0.5">workspace_mismatch</code> (a caller
              claimed a workspace other than the key's — the key's workspace always wins).
            </p>
            <p>
              Key management itself (list / create / revoke) requires a staff session with the owner or admin role
              in that workspace; the routes enforce it server-side regardless of what any UI shows.
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
            <AccordionItem value="key-required">
              <AccordionTrigger>The client says a key is required (401)</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                The request reached the server without a usable key: the Authorization header is missing, the key was
                pasted with extra spaces or quotes, or the key has been revoked or expired. Generate a fresh key in
                the API Keys section above and update the client with exactly the value shown, once.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="scope">
              <AccordionTrigger>Calls fail with "insufficient scope" (403)</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                The key works, but it doesn't hold the scope that tool needs. Scopes can't be added to an existing
                key — revoke it and generate a new one with the scopes the integration actually needs (or use the
                "Full agent access" preset).
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="no-tools">
              <AccordionTrigger>No tools show up after connecting</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                Confirm the URL ends in <code className="rounded bg-muted px-1 py-0.5">/api/mcp</code> and that the
                client is using the Streamable HTTP transport (in config files,{" "}
                <code className="rounded bg-muted px-1 py-0.5">"type": "http"</code>), not SSE or a local command.
                Then check the Server status card above: it should read "Live — key required".
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="empty-results">
              <AccordionTrigger>Tools work but return nothing</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                A key only ever sees the workspace it was generated in. If you're viewing a different workspace than
                the one the key belongs to, the data will look empty — generate a key in the workspace you mean to
                connect.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="revoke">
              <AccordionTrigger>How do I disconnect an assistant?</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                Revoke its key in the API Keys section above. Access ends immediately for both the MCP connection and
                the REST API. Removing the connector in the assistant's settings as well keeps things tidy, but the
                revocation is what actually cuts access.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Keys are workspace credentials: treat them like passwords, give each integration its own key, and revoke
          keys you no longer use.
        </span>
      </div>
    </div>
  );
}

export default McpConnectPanel;

/**
 * Agent integrations (MCP) — connection metadata for the in-app instruction screen.
 *
 * The shipped design (PR #181): the MCP server is this app's own route,
 * `POST /api/mcp` (Streamable HTTP, stateless JSON-RPC 2.0), implemented in
 * `src/server/agent-api/mcp.ts` and mounted by the Hono app. Authentication
 * is a per-workspace API key — `Authorization: Bearer <key>` or
 * `x-api-key: <key>` — issued and revoked in the API Keys section of this
 * page. The same key also works on the REST surface under `/api/v1/agent/*`.
 * There is no OAuth flow and no separately deployed function.
 *
 * The tool list below mirrors `MCP_TOOLS` in `src/server/agent-api/mcp.ts`.
 * Keep it in sync when tools are added or removed.
 */

export const MCP_SERVER_NAME = "servicewriter";
export const MCP_SERVER_TITLE = "ServiceWriter";
export const MCP_SERVER_VERSION = "1.0.0";

/** Placeholder shown wherever an example needs a key. Real keys are generated on this page. */
export const MCP_API_KEY_PLACEHOLDER = "sw_live_YOUR_API_KEY";

/** The Streamable HTTP endpoint MCP clients connect to (same origin as the app). */
export function getMcpServerUrl(): string {
  return typeof window !== "undefined" ? `${window.location.origin}/api/mcp` : "/api/mcp";
}

export const MCP_SERVER_URL = getMcpServerUrl();

/** Base URL of the REST agent surface; the same API key authenticates it. */
export function getAgentRestBaseUrl(): string {
  return typeof window !== "undefined" ? `${window.location.origin}/api/v1/agent` : "/api/v1/agent";
}

export const MCP_REST_BASE_URL = getAgentRestBaseUrl();

/** The exact header a client must send. */
export const MCP_AUTH_HEADER_EXAMPLE = `Authorization: Bearer ${MCP_API_KEY_PLACEHOLDER}`;

export interface McpToolInfo {
  name: string;
  title: string;
  description: string;
  readOnly: boolean;
}

export const MCP_TOOLS: readonly McpToolInfo[] = [
  {
    name: "list_appointments",
    title: "List appointments",
    description: "List the workspace's appointments, newest first. Filter by status or date range.",
    readOnly: true,
  },
  {
    name: "get_appointment",
    title: "Get appointment",
    description: "Fetch one appointment with its linked customer, vehicle, and location.",
    readOnly: true,
  },
  {
    name: "list_customers",
    title: "List customers",
    description: "List or search customers by name, email, or phone.",
    readOnly: true,
  },
  {
    name: "get_customer_history",
    title: "Get customer history",
    description: "Fetch one customer with their vehicles and most recent appointments and invoices.",
    readOnly: true,
  },
  {
    name: "list_services",
    title: "List services",
    description: "List the workspace's active services with pricing and estimated duration.",
    readOnly: true,
  },
  {
    name: "list_vehicles",
    title: "List vehicles",
    description: "Search vehicles by make, model, VIN, or plate.",
    readOnly: true,
  },
  {
    name: "list_locations",
    title: "List locations",
    description: "List the workspace's service locations.",
    readOnly: true,
  },
  {
    name: "get_capacity",
    title: "Get capacity",
    description: "Open capacity per day from the workspace's business hours and booked appointments.",
    readOnly: true,
  },
  {
    name: "get_revenue_summary",
    title: "Get revenue summary",
    description: "Billed and collected revenue over a date range, broken down by day.",
    readOnly: true,
  },
  {
    name: "get_booking_performance",
    title: "Get booking performance",
    description: "Booking volume and value for a window versus the previous equal-length window.",
    readOnly: true,
  },
  {
    name: "list_promotions",
    title: "List promotions",
    description: "The workspace's marketing campaigns and promotions.",
    readOnly: true,
  },
  {
    name: "create_customer",
    title: "Create customer",
    description: "Create a new customer record in the workspace.",
    readOnly: false,
  },
  {
    name: "check_availability",
    title: "Check availability",
    description:
      "Ask the workspace's own booking rules whether a slot is bookable (hours, lead time, blackout dates, conflicts, service radius), or list a day's open slots.",
    readOnly: true,
  },
  {
    name: "get_booking_rules",
    title: "Get booking rules",
    description: "The workspace's configured booking rules: hours, lead time, buffers, slot size, tax, radius, blackout dates.",
    readOnly: true,
  },
  {
    name: "create_booking",
    title: "Create booking",
    description:
      "Create an appointment through the canonical booking core. Rules are enforced, the price comes from the service catalog (callers cannot set prices), and the booking is attributed to this key's integrator.",
    readOnly: false,
  },
];

export interface McpClientGuide {
  id: string;
  label: string;
  steps: string[];
}

export const MCP_CLIENT_GUIDES: readonly McpClientGuide[] = [
  {
    id: "config",
    label: "Config file (Cursor, VS Code, …)",
    steps: [
      "Generate an API key in the API Keys section above and copy it — it is shown only once.",
      "Open your client's MCP configuration file (Cursor: Settings → MCP → “Add new MCP server”; VS Code: your workspace mcp.json).",
      "Paste the configuration snippet below and replace the placeholder with your API key.",
      "Save and reload the editor. The ServiceWriter tools appear in the agent's tool list.",
      "Ask something like “check availability this Friday” to confirm the connection works.",
    ],
  },
  {
    id: "claude",
    label: "Claude",
    steps: [
      "Generate an API key in the API Keys section above and copy it — it is shown only once.",
      "In Claude Code, add a remote MCP server with the connection URL below and an Authorization header carrying your key (the configuration snippet below is the same shape the CLI writes).",
      "In Claude desktop/web, use a client setup that supports custom headers on a remote connector, with the same URL and header.",
      "Restart or reload the client so it picks up the server, then confirm the ServiceWriter tools are listed.",
    ],
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    steps: [
      "Generate an API key in the API Keys section above and copy it — it is shown only once.",
      "Open ChatGPT and go to Settings → Connectors (Developer mode may be required on your plan).",
      "Choose “Add custom connector” / “Add MCP server” and paste the connection URL below.",
      "Where the connector form offers an authentication header, set it to the Authorization header shown below with your key. There is no OAuth sign-in for this server.",
      "Enable the connector in a chat and ask something like “list my appointments this week”.",
    ],
  },
  {
    id: "other",
    label: "Other MCP client",
    steps: [
      "Generate an API key in the API Keys section above and copy it — it is shown only once.",
      "Add a remote MCP server using the Streamable HTTP transport.",
      "Use the connection URL below as the server URL.",
      "Send your key on every request as the header “Authorization: Bearer <your key>” (the “x-api-key: <your key>” header works too).",
      "Call tools/list to confirm the tools are available.",
    ],
  },
];

/** Generic MCP client configuration with a placeholder key. */
export const MCP_CONFIG_SNIPPET = `{
  "mcpServers": {
    "servicewriter": {
      "type": "http",
      "url": "${MCP_SERVER_URL}",
      "headers": {
        "Authorization": "Bearer ${MCP_API_KEY_PLACEHOLDER}"
      }
    }
  }
}`;

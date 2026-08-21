/**
 * Agent integrations (MCP) — connection metadata for the in-app instruction screen.
 *
 * The server itself is defined in `src/lib/mcp/`; the tool list below mirrors
 * `.lovable/mcp/manifest.json`. Keep it in sync when tools are added or removed.
 *
 * Deployment note: this app is shipped through Vercel + GitHub. The bundled MCP
 * Edge Function is generated at `supabase/functions/mcp/index.ts`, but Lovable-managed
 * Supabase projects withhold a function named `mcp` from development deploys and only
 * push it on Lovable publish. To make the MCP server usable with a Vercel frontend, we
 * mirror the generated function to `supabase/functions/agent-api/index.ts` via
 * `scripts/sync-agent-api.mjs` and deploy the `agent-api` function instead.
 */
import { SERVICE_WRITER_BACKEND_PROJECT_ID } from "@/lib/appIdentity";

export const MCP_SERVER_NAME = "servicewriter";
export const MCP_SERVER_TITLE = "ServiceWriter";
export const MCP_SERVER_VERSION = "0.1.0";
export const MCP_EDGE_FUNCTION_NAME = "agent-api";

/** The Streamable HTTP endpoint MCP clients connect to. */
export const MCP_SERVER_URL = `https://${SERVICE_WRITER_BACKEND_PROJECT_ID}.supabase.co/functions/v1/${MCP_EDGE_FUNCTION_NAME}`;

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
    description:
      "List your shop's appointments, newest scheduled date first. Filter by status, date range, city, state, ZIP, service zone, or technician.",
    readOnly: true,
  },
  {
    name: "get_appointment",
    title: "Get appointment",
    description:
      "Fetch one appointment with its linked customer, vehicle, service, and full location context.",
    readOnly: true,
  },
  {
    name: "list_customers",
    title: "List customers",
    description: "List or search your customers by name, email, phone, city, or ZIP.",
    readOnly: true,
  },
  {
    name: "get_customer_history",
    title: "Get customer history",
    description: "Fetch one customer with their vehicles and most recent service records.",
    readOnly: true,
  },
  {
    name: "list_services",
    title: "List services",
    description: "List the services you offer, with default pricing and estimated duration.",
    readOnly: true,
  },
  {
    name: "list_vehicles",
    title: "List vehicles",
    description:
      "Search the vehicles you service by year, make, model, VIN, or plate, with linked customer and location context.",
    readOnly: true,
  },
  {
    name: "list_locations",
    title: "List locations & demand geography",
    description:
      "Your configured service zones and marketplace ZIPs, plus where demand actually came from in a date range.",
    readOnly: true,
  },
  {
    name: "get_capacity",
    title: "Get capacity",
    description:
      "Real open capacity per day from your business hours, blocked dates, technicians, and booked appointments.",
    readOnly: true,
  },
  {
    name: "get_revenue_summary",
    title: "Get revenue summary",
    description:
      "Billed and collected revenue over a date range, broken down by day, service, technician, city, or ZIP.",
    readOnly: true,
  },
  {
    name: "get_booking_performance",
    title: "Get booking performance",
    description:
      "Compare booking volume and value against the previous window or the same window last year, by city, ZIP, service, or source.",
    readOnly: true,
  },
  {
    name: "list_promotions",
    title: "List promotions",
    description: "Your coupon codes and email marketing campaigns, with usage and engagement stats.",
    readOnly: true,
  },
  {
    name: "create_customer",
    title: "Create customer",
    description: "Create a new customer record in your workspace.",
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
    id: "chatgpt",
    label: "ChatGPT",
    steps: [
      "Open ChatGPT on the web and go to Settings → Connectors (Developer mode may be required on your plan).",
      "Choose “Add custom connector” / “Add MCP server”.",
      "Paste the connection URL below and give it the name ServiceWriter.",
      "Leave authentication set to OAuth — ChatGPT registers itself automatically.",
      "Approve the sign-in screen that opens, using the same login you use for ServiceWriter.",
      "Back in a chat, enable the ServiceWriter connector and ask something like “list my appointments this week”.",
    ],
  },
  {
    id: "claude",
    label: "Claude",
    steps: [
      "Open Claude (web or desktop) and go to Settings → Connectors.",
      "Click “Add custom connector”.",
      "Paste the connection URL below and save.",
      "Claude opens a sign-in window — log in with your ServiceWriter account and approve access.",
      "The connector shows as connected with the ServiceWriter tools listed.",
    ],
  },
  {
    id: "cursor",
    label: "Cursor / VS Code",
    steps: [
      "Open your MCP configuration file (Cursor: Settings → MCP → “Add new MCP server”; VS Code: your workspace mcp.json).",
      'Add an entry with type "http" and the connection URL below.',
      "Reload the editor — it launches a browser window for sign-in.",
      "Approve access with your ServiceWriter login.",
      "The ServiceWriter tools appear in the agent's tool list.",
    ],
  },
  {
    id: "other",
    label: "Other MCP client",
    steps: [
      "Add a remote MCP server using the Streamable HTTP transport.",
      "Use the connection URL below as the server URL.",
      "Authentication is OAuth 2.1 with dynamic client registration and PKCE — no API key or token to paste.",
      "Complete the sign-in and approval screen when prompted.",
      "Call tools/list to confirm the tools are available.",
    ],
  },
];

export const MCP_CURSOR_SNIPPET = `{
  "mcpServers": {
    "servicewriter": {
      "type": "http",
      "url": "${MCP_SERVER_URL}"
    }
  }
}`;

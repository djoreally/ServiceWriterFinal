/**
 * Service Writer MCP server (Streamable HTTP, stateless JSON-RPC 2.0).
 *
 * This is the in-repo implementation of the MCP surface the app has
 * advertised since the Lovable era (`src/lib/mcpConnection.ts`): the 12
 * designed tools, plus the three the agent contract needs to actually
 * book work — `check_availability`, `get_booking_rules`, `create_booking`.
 *
 * One contract, not two: tools call the same service layer as the REST
 * agent endpoints, and authentication is the same workspace API key
 * (Authorization: Bearer <key> or x-api-key). The workspace is resolved
 * from the key; tools take no workspace parameter.
 */
import { ApiError } from "@/server/api";
import { authenticateApiKey, recordKeyUsage, type AgentKeyContext } from "./keys";
import * as svc from "./service";

export const MCP_SERVER_INFO = { name: "servicewriter", version: "1.0.0" } as const;
const PROTOCOL_VERSION = "2025-03-26";

interface ToolDef {
  name: string;
  title: string;
  description: string;
  readOnly: boolean;
  inputSchema: Record<string, unknown>;
  run: (db: any, ctx: AgentKeyContext, args: Record<string, any>) => Promise<unknown>;
}

const obj = (properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
});
const str = (description: string) => ({ type: "string", description });
const num = (description: string) => ({ type: "number", description });
const int = (description: string) => ({ type: "integer", description });

const isoDay = (daysFromNow: number) =>
  new Date(Date.now() + daysFromNow * 86_400_000).toISOString().slice(0, 10);

export const MCP_TOOLS: ToolDef[] = [
  {
    name: "list_appointments",
    title: "List appointments",
    description: "List the workspace's appointments, newest first. Filter by status or date range.",
    readOnly: true,
    inputSchema: obj({ from: str("ISO start (starts_at >=)"), to: str("ISO end (starts_at <=)"), status: str("Status filter"), limit: int("Page size (max 100)"), offset: int("Page offset") }),
    run: (db, ctx, a) => svc.listAppointments(db, ctx, a),
  },
  {
    name: "get_appointment",
    title: "Get appointment",
    description: "Fetch one appointment with its linked customer, vehicle, and location.",
    readOnly: true,
    inputSchema: obj({ id: str("Appointment id") }, ["id"]),
    run: (db, ctx, a) => svc.getAppointment(db, ctx, String(a.id)),
  },
  {
    name: "list_customers",
    title: "List customers",
    description: "List or search customers by name, email, or phone.",
    readOnly: true,
    inputSchema: obj({ search: str("Search text"), limit: int("Page size (max 100)"), offset: int("Page offset") }),
    run: (db, ctx, a) => svc.listCustomers(db, ctx, a),
  },
  {
    name: "get_customer_history",
    title: "Get customer history",
    description: "Fetch one customer with their vehicles and most recent appointments and invoices.",
    readOnly: true,
    inputSchema: obj({ customer_id: str("Customer id") }, ["customer_id"]),
    run: (db, ctx, a) => svc.getCustomerHistory(db, ctx, String(a.customer_id)),
  },
  {
    name: "list_services",
    title: "List services",
    description: "List the workspace's active services with pricing and estimated duration.",
    readOnly: true,
    inputSchema: obj({}),
    run: (db, ctx) => svc.getCatalog(db, ctx),
  },
  {
    name: "list_vehicles",
    title: "List vehicles",
    description: "Search vehicles by make, model, VIN, or plate.",
    readOnly: true,
    inputSchema: obj({ search: str("Search text"), limit: int("Page size (max 100)"), offset: int("Page offset") }),
    run: (db, ctx, a) => svc.listVehicles(db, ctx, a),
  },
  {
    name: "list_locations",
    title: "List locations",
    description: "List the workspace's service locations.",
    readOnly: true,
    inputSchema: obj({}),
    run: (db, ctx) => svc.listLocations(db, ctx),
  },
  {
    name: "get_capacity",
    title: "Get capacity",
    description: "Open capacity per day from the workspace's business hours and booked appointments.",
    readOnly: true,
    inputSchema: obj({ from: str("First date (YYYY-MM-DD)"), to: str("Last date (YYYY-MM-DD)") }),
    run: (db, ctx, a) => svc.getCapacity(db, ctx, { from: a.from ?? isoDay(0), to: a.to ?? isoDay(7) }),
  },
  {
    name: "get_revenue_summary",
    title: "Get revenue summary",
    description: "Billed and collected revenue over a date range, broken down by day.",
    readOnly: true,
    inputSchema: obj({ from: str("Start (ISO or YYYY-MM-DD)"), to: str("End (ISO or YYYY-MM-DD)") }),
    run: (db, ctx, a) =>
      svc.getRevenueSummary(db, ctx, {
        from: a.from ?? `${isoDay(-30)}T00:00:00.000Z`,
        to: a.to ?? `${isoDay(0)}T23:59:59.999Z`,
      }),
  },
  {
    name: "get_booking_performance",
    title: "Get booking performance",
    description: "Booking volume and value for a window versus the previous equal-length window.",
    readOnly: true,
    inputSchema: obj({ from: str("Start (ISO)"), to: str("End (ISO)") }),
    run: (db, ctx, a) =>
      svc.getBookingPerformance(db, ctx, {
        from: a.from ?? `${isoDay(-30)}T00:00:00.000Z`,
        to: a.to ?? `${isoDay(0)}T23:59:59.999Z`,
      }),
  },
  {
    name: "list_promotions",
    title: "List promotions",
    description: "The workspace's marketing campaigns and promotions.",
    readOnly: true,
    inputSchema: obj({}),
    run: (db, ctx) => svc.listPromotions(db, ctx),
  },
  {
    name: "create_customer",
    title: "Create customer",
    description: "Create a new customer record in the workspace.",
    readOnly: false,
    inputSchema: obj(
      {
        first_name: str("First name"),
        last_name: str("Last name"),
        company_name: str("Company name"),
        email: str("Email"),
        phone: str("Phone"),
        address_line1: str("Address line 1"),
        city: str("City"),
        region: str("State / region"),
        postal_code: str("Postal code"),
        notes: str("Notes"),
      },
      ["first_name"],
    ),
    run: (db, ctx, a) => svc.createCustomer(db, ctx, a as any),
  },
  {
    name: "check_availability",
    title: "Check availability",
    description:
      "Ask the workspace's own booking rules whether a slot is bookable (hours, lead time, blackout dates, conflicts, service radius), or list a day's open slots.",
    readOnly: true,
    inputSchema: obj({
      starts_at: str("ISO start for a single-slot check"),
      date: str("YYYY-MM-DD to list open slots for a day"),
      service_catalog_id: str("Service id (sets duration from the catalog)"),
      duration_minutes: int("Duration override in minutes"),
      service_lat: num("Service location latitude (fence check)"),
      service_lng: num("Service location longitude (fence check)"),
    }),
    run: (db, ctx, a) =>
      svc.checkAvailability(db, ctx, {
        starts_at: a.starts_at,
        date: a.date,
        service_catalog_id: a.service_catalog_id,
        duration_minutes: a.duration_minutes,
        service_lat: a.service_lat ?? null,
        service_lng: a.service_lng ?? null,
      }),
  },
  {
    name: "get_booking_rules",
    title: "Get booking rules",
    description: "The workspace's configured booking rules: hours, lead time, buffers, slot size, tax, radius, blackout dates.",
    readOnly: true,
    inputSchema: obj({}),
    run: (db, ctx) => svc.getBookingRules(db, ctx),
  },
  {
    name: "create_booking",
    title: "Create booking",
    description:
      "Create an appointment through the canonical booking core. Rules are enforced, the price comes from the service catalog (callers cannot set prices), and the booking is attributed to this key's integrator.",
    readOnly: false,
    inputSchema: obj(
      {
        customer_id: str("Existing customer id"),
        customer: obj({ first_name: str("First name"), last_name: str("Last name"), email: str("Email"), phone: str("Phone") }, ["first_name"]),
        vehicle_id: str("Existing vehicle id"),
        vehicle: obj({ year: int("Year"), make: str("Make"), model: str("Model"), vin: str("VIN"), license_plate: str("Plate") }),
        service_catalog_id: str("Service id from list_services"),
        starts_at: str("ISO start time"),
        ends_at: str("ISO end time (defaults to start + service duration)"),
        title: str("Title"),
        notes: str("Notes"),
        location_address: str("Service address"),
        customer_city: str("City"),
        customer_state: str("State"),
        customer_postal_code: str("Postal code"),
      },
      ["starts_at"],
    ),
    run: (db, ctx, a) => svc.createBooking(db, ctx, a as any),
  },
];

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, any>;
}

function rpcError(id: JsonRpcRequest["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function rpcResult(id: JsonRpcRequest["id"], result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

/**
 * Handle one JSON-RPC request (or a batch). Returns the response payload,
 * or null for notifications (no response per spec).
 */
export async function handleMcpMessage(
  db: any,
  request: Request,
  message: JsonRpcRequest | JsonRpcRequest[],
): Promise<unknown | null> {
  if (Array.isArray(message)) {
    const responses: unknown[] = [];
    for (const item of message) {
      const res = await handleMcpMessage(db, request, item);
      if (res !== null) responses.push(res);
    }
    return responses.length ? responses : null;
  }

  const { id, method, params } = message;
  const isNotification = id === undefined || id === null;

  try {
    switch (method) {
      case "initialize":
        return rpcResult(id, {
          protocolVersion: params?.protocolVersion ?? PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: MCP_SERVER_INFO,
        });
      case "ping":
        return isNotification ? null : rpcResult(id, {});
      case "tools/list": {
        await authenticateApiKey(db, extractFromRequest(request));
        return rpcResult(id, {
          tools: MCP_TOOLS.map((t) => ({
            name: t.name,
            title: t.title,
            description: t.description,
            inputSchema: t.inputSchema,
            annotations: { readOnlyHint: t.readOnly },
          })),
        });
      }
      case "tools/call": {
        const ctx = await authenticateApiKey(db, extractFromRequest(request));
        const name = params?.name;
        const tool = MCP_TOOLS.find((t) => t.name === name);
        if (!tool) return rpcError(id, -32602, `Unknown tool: ${String(name)}`);
        try {
          const result = await tool.run(db, ctx, params?.arguments ?? {});
          if (!tool.readOnly) {
            await recordKeyUsage(db, ctx, `mcp:${tool.name}`, "mcp_tool", tool.name);
          }
          return rpcResult(id, {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            structuredContent: result as Record<string, unknown>,
            isError: false,
          });
        } catch (e) {
          const messageText = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Tool call failed";
          return rpcResult(id, {
            content: [{ type: "text", text: messageText }],
            isError: true,
          });
        }
      }
      default:
        if (isNotification || (typeof method === "string" && method.startsWith("notifications/"))) return null;
        return rpcError(id, -32601, `Method not found: ${String(method)}`);
    }
  } catch (e) {
    if (e instanceof ApiError && (e as any).status === 401) {
      return rpcError(id, -32001, e.message);
    }
    if (e instanceof ApiError) {
      return rpcError(id, -32000, e.message);
    }
    throw e;
  }
}

function extractFromRequest(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (bearer) return bearer;
  return request.headers.get("x-api-key")?.trim() ?? null;
}

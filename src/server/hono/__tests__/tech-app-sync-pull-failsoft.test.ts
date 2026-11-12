/**
 * Regression (2026-11-12, LIVE): GET /v1/tech-app/sync/pull returned
 * HTTP 500 for the owner's real account — the phone's Profile read
 * "Last synced: never / Last attempt failed: Sync pull failed
 * (HTTP 500)" — while every mocked sync suite stayed green.
 *
 * Shape of the incident: PR #261 (job flow) taught the pull two NEW
 * auxiliary reads — service_playbooks and service_playbook_templates,
 * both selecting the `components` column that migration
 * 20261112030000 adds. PostgREST answers a select against a column
 * the live schema does not carry with 42703, the handler threw the
 * error object, and the whole pull died: one auxiliary read failing
 * must never take the jobs change set down with it. The mocked
 * suites cannot see this genus — the mock returns whatever the test
 * seeds, including a column error only when a test thinks to seed
 * one. These tests seed exactly that.
 *
 * Fixtures mirror the owner's real census (MOMS workspace, first
 * pull — last_pulled_at=0, the phone had never synced): a worked
 * job with a travel leg (Dave), a twice-edited appointment
 * (Jennifer), and a public-booking-flow appointment (Sarah).
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { installWebGlobals as mockInstallWebGlobals } from "../test-support/webGlobals";
import { makeServerApiMock as mockMakeServerApiMock } from "../test-support/serverApiMock";
import {
  makeSupabaseLibMock as mockMakeSupabaseLibMock,
} from "../test-support/moduleMocks";

jest.mock("next/server", () => {
  mockInstallWebGlobals();
  return jest.requireActual("next/server");
});
jest.mock("@/server/api", () =>
  mockMakeServerApiMock(jest.requireActual("@/server/api")),
);
jest.mock("@/lib/supabase", () =>
  mockMakeSupabaseLibMock(),
);

import { workOrdersRouter as workOrdersRouterRaw } from "@/server/hono/routes/work-orders";
import { testRouter } from "../test-support/routerTest";
import {
  db,
  resetHarness,
  USER_ID,
  WS_ID,
} from "../test-support/state";

const router = testRouter(workOrdersRouterRaw);

const CUST_DAVE = "770e8400-e29b-41d4-a716-446655440011";
const CUST_JEN = "770e8400-e29b-41d4-a716-446655440012";
const CUST_SARAH = "770e8400-e29b-41d4-a716-446655440013";
const VEH_DAVE = "aa0e8400-e29b-41d4-a716-446655440011";
const VEH_JEN = "aa0e8400-e29b-41d4-a716-446655440012";
const VEH_SARAH = "aa0e8400-e29b-41d4-a716-446655440013";
const APPT_DAVE = "990e8400-e29b-41d4-a716-446655440011";
const APPT_JEN = "990e8400-e29b-41d4-a716-446655440012";
const APPT_SARAH = "990e8400-e29b-41d4-a716-446655440013";
const CAT_OIL = "bb0e8400-e29b-41d4-a716-446655440011";
const CAT_EURO = "bb0e8400-e29b-41d4-a716-446655440012";
const CAT_MOBIL = "bb0e8400-e29b-41d4-a716-446655440013";
const TECH_ID = "880e8400-e29b-41d4-a716-446655440001";

/** The PostgREST answer for a select against a not-yet-migrated column. */
const PHANTOM_COMPONENTS = {
  code: "42703",
  message: "column service_playbooks.components does not exist",
  details: null,
  hint: null,
};

function seedCensus() {
  db["workspace_members"] = { data: [{ workspace_id: WS_ID }], error: null };
  db["appointments"] = {
    data: [
      {
        id: APPT_DAVE,
        workspace_id: WS_ID,
        customer_id: CUST_DAVE,
        vehicle_id: VEH_DAVE,
        assigned_user_id: USER_ID,
        status: "confirmed",
        dispatch_status: "en_route",
        starts_at: "2026-11-12T13:30:00.000Z",
        ends_at: "2026-11-12T14:15:00.000Z",
        source: "office",
        confirmation_code: "DAVE-1",
        notes: null,
        metadata: {
          dispatch_status: "en_route",
          en_route_at: "2026-11-12T13:20:00.000Z",
          en_route_lat: 40.0123,
          en_route_lng: -75.1234,
        },
        created_at: "2026-11-10T15:00:00.000Z",
        updated_at: "2026-11-12T13:20:00.000Z",
      },
      {
        id: APPT_JEN,
        workspace_id: WS_ID,
        customer_id: CUST_JEN,
        vehicle_id: VEH_JEN,
        assigned_user_id: USER_ID,
        status: "confirmed",
        dispatch_status: null,
        starts_at: "2026-11-14T15:00:00.000Z",
        ends_at: "2026-11-14T15:30:00.000Z",
        source: "office",
        confirmation_code: "MOMS-7F5FD",
        notes: null,
        metadata: {},
        created_at: "2026-11-09T15:00:00.000Z",
        updated_at: "2026-11-12T17:10:00.000Z",
      },
      {
        id: APPT_SARAH,
        workspace_id: WS_ID,
        customer_id: CUST_SARAH,
        vehicle_id: VEH_SARAH,
        assigned_user_id: USER_ID,
        status: "confirmed",
        dispatch_status: null,
        starts_at: "2026-11-14T17:00:00.000Z",
        ends_at: "2026-11-14T17:45:00.000Z",
        source: "website",
        confirmation_code: "BE5A2E8A",
        notes: null,
        metadata: {},
        created_at: "2026-11-12T17:03:00.000Z",
        updated_at: "2026-11-12T17:03:00.000Z",
      },
    ],
    error: null,
  };
  db["customers"] = {
    data: [
      { id: CUST_DAVE, first_name: "Dave", last_name: "Hamilton", company_name: "Atlantic Refrigeration Company", email: "dave@atlanticice.com", phone: "215-426-4722", address_line1: "529 E Thompson St", address_line2: null, city: "Philadelphia", region: "PA", postal_code: "19125" },
      { id: CUST_JEN, first_name: "Jennifer", last_name: "Brennan", company_name: null, email: null, phone: "646-784-6135", address_line1: "264 Grays Ln", address_line2: null, city: "Haverford", region: "PA", postal_code: "19041" },
      { id: CUST_SARAH, first_name: "Sarah", last_name: "Barnett", company_name: null, email: null, phone: "610-283-2657", address_line1: "1439 Joel Drive", address_line2: null, city: "Ambler", region: "PA", postal_code: "19002" },
    ],
    error: null,
  };
  db["vehicles"] = {
    data: [
      { id: VEH_DAVE, vin: "1FTBR1Y86PKB51521", year: 2023, make: "Ford", model: "Transit T250", trim: null, mileage: 57700, license_plate: "ZXB-9797" },
      { id: VEH_JEN, vin: null, year: 2026, make: "BMW", model: "X7", trim: null, mileage: null, license_plate: null },
      { id: VEH_SARAH, vin: null, year: 2016, make: "Honda", model: "CR-V", trim: null, mileage: null, license_plate: null },
    ],
    error: null,
  };
  db["appointment_items"] = {
    data: [
      { id: "cc01", appointment_id: APPT_DAVE, service_catalog_id: CAT_OIL, item_type: "service", description: "Oil Change Service", quantity: 1, unit_price: 120, sort_order: 0, service_catalog: { id: CAT_OIL, name: "Oil Change Service" } },
      { id: "cc02", appointment_id: APPT_JEN, service_catalog_id: CAT_EURO, item_type: "service", description: "European Spec Oil Change", quantity: 1, unit_price: 149, sort_order: 0, service_catalog: { id: CAT_EURO, name: "European Spec Oil Change" } },
      { id: "cc03", appointment_id: APPT_JEN, service_catalog_id: null, item_type: "fee", description: "Additional oil — 2 qt over the included 5 qt", quantity: 1, unit_price: 28, sort_order: 1, service_catalog: null },
      { id: "cc04", appointment_id: APPT_SARAH, service_catalog_id: CAT_MOBIL, item_type: "service", description: "Mobil 1 Full Synthetic", quantity: 1, unit_price: 129, sort_order: 0, service_catalog: { id: CAT_MOBIL, name: "Mobil 1 Full Synthetic" } },
    ],
    error: null,
  };
  // Healthy child tables (SYNC-1b): nothing recorded yet.
  db["service_inspections"] = { data: [], error: null };
  db["service_recommendations"] = { data: [], error: null };
  db["job_photos"] = { data: [], error: null };
  db["inspection_results"] = { data: [], error: null };
  db["location_history"] = { data: [], error: null };
  db["job_execution_checklists"] = { data: [], error: null };
  db["technicians:single"] = { data: { id: TECH_ID }, error: null };
}

function seedHealthyPlaybooks() {
  db["service_playbooks"] = {
    data: [
      {
        id: "dd01",
        service_catalog_id: CAT_OIL,
        steps: [{ label: "Drain oil" }, { label: "Replace filter" }],
        components: ["Oil filter", "5 qt oil"],
      },
    ],
    error: null,
  };
  db["service_playbook_templates"] = {
    data: [
      {
        name: "European Spec Oil Change",
        steps: ["Warm engine"],
        components: ["Euro oil"],
      },
    ],
    error: null,
  };
}

const pull = () => router.request("/v1/tech-app/sync/pull?last_pulled_at=0");

async function jobRows(res: Response) {
  const body = (await res.json()) as any;
  return body?.data?.changes?.jobs as
    | { created: Array<Record<string, any>>; updated: unknown[]; deleted: string[] }
    | undefined;
}

describe("GET /v1/tech-app/sync/pull — fail-soft (2026-11-12 live 500)", () => {
  beforeEach(() => {
    resetHarness();
    seedCensus();
  });

  it("serves the full jobs change set when the playbooks read fails (phantom components column)", async () => {
    db["service_playbooks"] = { data: null, error: PHANTOM_COMPONENTS };
    db["service_playbook_templates"] = {
      data: null,
      error: { ...PHANTOM_COMPONENTS, message: "column service_playbook_templates.components does not exist" },
    };
    const res = await pull();
    expect(res.status).toBe(200);
    const jobs = await jobRows(res);
    expect(jobs).toBeDefined();
    const ids = (jobs?.created ?? []).map((row) => row.id).sort();
    expect(ids).toEqual([APPT_DAVE, APPT_JEN, APPT_SARAH].sort());
    // Playbook data degrades to empty, never fatal: services ride along.
    const jen = jobs?.created.find((row) => row.id === APPT_JEN);
    const services = JSON.parse(jen?.services_json ?? "[]") as Array<Record<string, any>>;
    expect(services.length).toBeGreaterThan(0);
    expect(services[0].components).toEqual([]);
    expect(services[0].sopSteps).toEqual([]);
  });

  it("serves the pull when only the templates read fails", async () => {
    seedHealthyPlaybooks();
    db["service_playbook_templates"] = { data: null, error: PHANTOM_COMPONENTS };
    const res = await pull();
    expect(res.status).toBe(200);
    const jobs = await jobRows(res);
    expect((jobs?.created ?? []).length).toBe(3);
    // The workspace playbook still lands for the service it covers.
    const dave = jobs?.created.find((row) => row.id === APPT_DAVE);
    const services = JSON.parse(dave?.services_json ?? "[]") as Array<Record<string, any>>;
    expect(services[0].components).toEqual(["Oil filter", "5 qt oil"]);
    expect(services[0].sopSteps).toEqual(["Drain oil", "Replace filter"]);
  });

  it("serves the pull when the SOP checklist read fails", async () => {
    seedHealthyPlaybooks();
    db["job_execution_checklists"] = {
      data: null,
      error: { code: "42P01", message: "relation \"public.job_execution_checklists\" does not exist", details: null, hint: null },
    };
    const res = await pull();
    expect(res.status).toBe(200);
    const jobs = await jobRows(res);
    expect((jobs?.created ?? []).length).toBe(3);
  });

  it("serves the pull when the technician lookup errors (multiple rows)", async () => {
    seedHealthyPlaybooks();
    db["technicians:single"] = {
      data: null,
      error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: null, hint: null },
    };
    const res = await pull();
    expect(res.status).toBe(200);
    const jobs = await jobRows(res);
    expect((jobs?.created ?? []).length).toBe(3);
  });

  it("healthy path still carries playbook components + SOP steps per service", async () => {
    seedHealthyPlaybooks();
    const res = await pull();
    expect(res.status).toBe(200);
    const jobs = await jobRows(res);
    expect((jobs?.created ?? []).length).toBe(3);
    const jen = jobs?.created.find((row) => row.id === APPT_JEN);
    const services = JSON.parse(jen?.services_json ?? "[]") as Array<Record<string, any>>;
    // Template fallback by service name (no workspace playbook for CAT_EURO).
    expect(services[0].components).toEqual(["Euro oil"]);
    expect(services[0].sopSteps).toEqual(["Warm engine"]);
    // Dave's travel leg survives composition.
    const dave = jobs?.created.find((row) => row.id === APPT_DAVE);
    expect(dave?.status).toBe("en_route");
    expect(dave?.en_route_at).toBe("2026-11-12T13:20:00.000Z");
  });
});

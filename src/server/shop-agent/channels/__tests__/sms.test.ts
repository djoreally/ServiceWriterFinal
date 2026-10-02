/**
 * Tests for src/server/shop-agent/channels/sms.ts.
 *
 * The reasoner is a stub (no model calls); the Twilio adapter is faked
 * (captures sends); supabase is an in-memory fake. The zeroai modules are
 * REAL (pure/deterministic) except loadMemory, which is controlled per test.
 * getShopProfile is mocked (DB-backed in reality); the booking module's
 * default port is mocked to null so tests inject explicit stubs.
 */
import type {
  ConversationMemory,
  ModelReasoner,
  ReasonInput,
  ReasonOutput,
} from "../../zeroai/types";
import { hashPhoneE164 } from "../../zeroai/types";
import type { ShopProfile } from "../../zeroai/types";
import { AGENT_REGISTRY } from "../../zeroai/registry";
import { processInboundSms } from "../sms";
import type { SmsPipelineDeps } from "../sms";
import type { BookingPort } from "../booking";
import type { ShopAgentSupabase } from "../db";
import { FakeSupabase } from "../test-support/fake-supabase";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const WS = "00000000-0000-4000-8000-000000000001";
const SHOP_NUMBER = "+12157672125";
const CALLER = "+15551234567";

const mockProfile: ShopProfile = {
  workspaceId: WS,
  businessName: "MOMS Mobile Oil Change",
  publicPhone: SHOP_NUMBER,
  hours: {
    timezone: "America/New_York",
    days: {
      monday: { open: "08:00", close: "19:00" },
      tuesday: { open: "08:00", close: "19:00" },
      wednesday: { open: "08:00", close: "19:00" },
      thursday: { open: "08:00", close: "19:00" },
      friday: { open: "08:00", close: "19:00" },
      saturday: { open: "08:00", close: "19:00" },
      sunday: null,
    },
  },
  serviceArea: { towns: ["Ambler"], zips: ["19002"] },
  services: [],
  completenessScore: 90,
  missingFields: [],
};

function testLocalParts(timeZone: string, date: Date): { weekday: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const text = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return {
    weekday: text("weekday").toLowerCase(),
    minutes: Number(text("hour")) * 60 + Number(text("minute")),
  };
}

jest.mock("../../profile", () => ({
  getShopProfile: jest.fn(async () => mockProfile),
  currentLocalMinutes: (timeZone: string, date: Date = new Date()) =>
    testLocalParts(timeZone, date).minutes,
  isWithinBusinessHours: (profile: ShopProfile, date: Date) => {
    const { weekday, minutes } = testLocalParts(profile.hours.timezone || "UTC", date);
    const day = profile.hours.days[weekday];
    if (!day) return false;
    const [openH, openM] = day.open.split(":").map(Number);
    const [closeH, closeM] = day.close.split(":").map(Number);
    return minutes >= openH * 60 + openM && minutes < closeH * 60 + closeM;
  },
}));


// NOTE: see twilio-voice.test.ts — the real gates.ts has a broken
// require("../policy"); this mirrors its documented behavior.
jest.mock("../../zeroai/gates", () => {
  const { checkPolicy } = jest.requireActual("../../zeroai/policy");
  return {
    checkGate: async (gate: string, ctx: any) => {
      if (gate === "policy_check") {
        if (!ctx.policyAction) return { gate, passed: false, reason: "no policy action provided" };
        const decision = (checkPolicy as any)(ctx.policyAction, ctx.policyCtx ?? {});
        return decision.decision === "act"
          ? { gate, passed: true, reason: `policy approved: ${decision.ruleId} — ${decision.reason}` }
          : { gate, passed: false, reason: `policy ${decision.decision}: ${decision.reason} (rule ${decision.ruleId})` };
      }
      if (gate === "slot_exists") {
        return ctx.slots && ctx.slots.length > 0
          ? { gate, passed: true, reason: `${ctx.slots.length} slot(s) available from the booking system` }
          : { gate, passed: false, reason: "no slots available from the booking system" };
      }
      if (gate === "appointment_verified") {
        if (!ctx.appointmentLookup) return { gate, passed: false, reason: "no appointment lookup provided" };
        if (!ctx.appointmentId) return { gate, passed: false, reason: "no appointment id provided to verify" };
        const verified = await ctx.appointmentLookup(ctx.appointmentId);
        return verified
          ? { gate, passed: true, reason: `appointment ${ctx.appointmentId} verified` }
          : { gate, passed: false, reason: `appointment ${ctx.appointmentId} could not be verified` };
      }
      return { gate, passed: false, reason: `unknown gate: ${gate}` };
    },
  };
});

const mockLoadMemory = jest.fn(async (): Promise<ConversationMemory | null> => null);
jest.mock("../../zeroai/memory", () => {
  const actual = jest.requireActual("../../zeroai/memory");
  return {
    ...actual,
    loadMemory: (...args: any[]) => (mockLoadMemory as any)(...args),
  };
});

// The real booking module is DB-heavy; default the injected port to null
// (booking disabled) and pass explicit stubs per test.
jest.mock("../../booking", () => ({ bookingPort: null }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

class StubReasoner implements ModelReasoner {
  readonly name = "stub-reasoner";
  calls: ReasonInput[] = [];
  constructor(private outputs: ReasonOutput[]) {}
  async reason(input: ReasonInput): Promise<ReasonOutput> {
    this.calls.push(input);
    const next = this.outputs.shift();
    if (!next) throw new Error("StubReasoner: no outputs left");
    return next;
  }
}

const replyOutput = (overrides: Partial<ReasonOutput> = {}): ReasonOutput => ({
  reply: "What service do you need?",
  extractedFacts: { need: "oil change" },
  suggestedState: "need_identified",
  confidence: 0.9,
  ...overrides,
});

// 2026-09-28 is a Monday; America/New_York is UTC-4 (EDT).
const MON_10AM = new Date("2026-09-28T14:00:00Z");
const MON_3AM = new Date("2026-09-28T07:00:00Z");

interface Ctx {
  supabase: FakeSupabase;
  db: ShopAgentSupabase;
  adapter: { send: jest.Mock };
}

function makeCtx(): Ctx {
  const supabase = new FakeSupabase({});
  let seq = 0;
  const adapter = {
    providerName: "stub",
    sendSms: jest.fn(async () => {
      seq += 1;
      return {
        providerMessageId: `SM-sent-${seq}`,
        providerName: "stub",
        status: "sent" as const,
        acceptedAt: new Date().toISOString(),
      };
    }),
  };
  return { supabase, db: supabase as unknown as ShopAgentSupabase, adapter };
}

function makeDeps(ctx: Ctx, reasoner: ModelReasoner): SmsPipelineDeps {
  return { supabase: ctx.db, smsAdapter: ctx.adapter, reasoner };
}

const inbound = (body: string, providerMessageId = "SM-200") => ({
  workspaceId: WS,
  from: CALLER,
  body,
  providerMessageId,
});

function ledgerActions(ctx: Ctx, action: string): any[] {
  return ctx.supabase.rowsOf("shop_agent_ledger").filter((r) => r.action === action);
}

function savedMemoryRow(ctx: Ctx): any {
  return ctx.supabase.rowsOf("shop_agent_conversations")[0];
}

function memoryState(
  state: ConversationMemory["state"],
  facts: ConversationMemory["facts"] = { extra: {} },
): ConversationMemory {
  return {
    workspaceId: WS,
    callerHash: hashPhoneE164(CALLER),
    state,
    facts,
    summary: "",
    turnCount: 2,
    updatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

const stubPort: BookingPort = {
  getSlots: async () => [
    { startsAt: "2026-09-29T14:00:00Z", endsAt: "2026-09-29T14:30:00Z", label: "Tue 10:00 AM" },
    { startsAt: "2026-09-29T15:00:00Z", endsAt: "2026-09-29T15:30:00Z", label: "Tue 11:00 AM" },
  ],
  book: async () => ({ data: { id: "appt-1" } }),
  findOrCreateCustomer: async () => ({ id: "cust-1", created: false }),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockLoadMemory.mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
// STOP / START / HELP / suppression
// ---------------------------------------------------------------------------

describe("STOP / START / HELP / suppression", () => {
  it("opts out on STOP, confirms once, and logs to messaging_suppressions", async () => {
    const ctx = makeCtx();
    const reasoner = new StubReasoner([]);
    const result = await processInboundSms(makeDeps(ctx, reasoner), inbound("STOP", "SM-100"), {
      now: MON_10AM,
    });

    expect(result.outcome).toBe("stop");
    const rows = ctx.supabase.rowsOf("messaging_suppressions");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      workspace_id: WS,
      channel: "sms",
      phone: CALLER,
      reason: "unsubscribe",
      purpose: "transactional",
      source: "shop-agent-sms",
      active: true,
    });
    expect(ctx.adapter.sendSms).toHaveBeenCalledTimes(1);
    const req = ctx.adapter.sendSms.mock.calls[0][0];
    expect(req.body).toBe(
      "You're opted out of texts from MOMS Mobile Oil Change. Reply START to rejoin.",
    );
    expect(req.idempotencyKey).toBe("sms:SM-100");
    expect(ledgerActions(ctx, "stop_received")).toHaveLength(1);
    expect(reasoner.calls).toHaveLength(0);
  });

  it("rejoins on START by lifting the suppression", async () => {
    const ctx = makeCtx();
    await ctx.db.from("messaging_suppressions").insert({
      workspace_id: WS,
      channel: "sms",
      phone: CALLER,
      reason: "unsubscribe",
      purpose: "transactional",
      source: "shop-agent-sms",
      active: true,
      suppressed_at: new Date().toISOString(),
    });
    const result = await processInboundSms(
      makeDeps(ctx, new StubReasoner([])),
      inbound("START", "SM-101"),
      { now: MON_10AM },
    );
    expect(result.outcome).toBe("start");
    const rows = ctx.supabase.rowsOf("messaging_suppressions");
    expect(rows[0].active).toBe(false);
    expect(rows[0].lifted_at).toBeTruthy();
    expect(ctx.adapter.sendSms.mock.calls[0][0].body).toContain("You're back on texts");
    expect(ledgerActions(ctx, "start_received")).toHaveLength(1);
  });

  it("answers HELP even for opted-out numbers", async () => {
    const ctx = makeCtx();
    await ctx.db.from("messaging_suppressions").insert({
      workspace_id: WS,
      channel: "sms",
      phone: CALLER,
      reason: "unsubscribe",
      purpose: "transactional",
      source: "shop-agent-sms",
      active: true,
      suppressed_at: new Date().toISOString(),
    });
    const result = await processInboundSms(
      makeDeps(ctx, new StubReasoner([])),
      inbound("help", "SM-102"),
      { now: MON_10AM },
    );
    expect(result.outcome).toBe("help");
    expect(ctx.adapter.sendSms).toHaveBeenCalledTimes(1);
    expect(ctx.adapter.sendSms.mock.calls[0][0].body).toBe(
      "You're texting MOMS Mobile Oil Change at +12157672125. Reply STOP to opt out.",
    );
    expect(ledgerActions(ctx, "help_sent")).toHaveLength(1);
  });

  it("drops messages from suppressed senders silently", async () => {
    const ctx = makeCtx();
    await ctx.db.from("messaging_suppressions").insert({
      workspace_id: WS,
      channel: "sms",
      phone: CALLER,
      reason: "unsubscribe",
      purpose: "transactional",
      source: "shop-agent-sms",
      active: true,
      suppressed_at: new Date().toISOString(),
    });
    const result = await processInboundSms(
      makeDeps(ctx, new StubReasoner([replyOutput()])),
      inbound("hello there", "SM-103"),
      { now: MON_10AM },
    );
    expect(result.outcome).toBe("dropped_suppressed");
    expect(ctx.adapter.sendSms).not.toHaveBeenCalled();
    expect(ledgerActions(ctx, "message_dropped_suppressed")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Conversation pipeline
// ---------------------------------------------------------------------------

describe("conversation pipeline", () => {
  it("runs greeted -> need_identified: reply sent, memory saved, ledger chained", async () => {
    const ctx = makeCtx();
    const reasoner = new StubReasoner([replyOutput()]);
    const result = await processInboundSms(
      makeDeps(ctx, reasoner),
      inbound("I need an oil change", "SM-200"),
      { now: MON_10AM },
    );

    expect(result).toMatchObject({ outcome: "replied", state: "need_identified" });
    // Instruction set comes from the real agent registry.
    expect(reasoner.calls[0].instructionSet).toBe(AGENT_REGISTRY.sms_agent.instructionSet);
    expect(reasoner.calls[0].intent.intentId).toMatch(/^inbound-sms\//);

    expect(ctx.adapter.sendSms).toHaveBeenCalledTimes(1);
    const req = ctx.adapter.sendSms.mock.calls[0][0];
    expect(req.idempotencyKey).toBe("sms:SM-200");
    expect(req.body).toBe("What service do you need?");

    const mem = savedMemoryRow(ctx);
    expect(mem).toBeTruthy();
    expect(mem.state).toBe("need_identified");
    expect(mem.facts.need).toBe("oil change");
    expect(mem.turn_count).toBe(1);
    expect(mem.caller_hash).toBe(hashPhoneE164(CALLER));
    expect(new Date(mem.expires_at).getTime()).toBeGreaterThan(Date.now());

    const received = ledgerActions(ctx, "sms_received");
    const replied = ledgerActions(ctx, "sms_replied");
    expect(received).toHaveLength(1);
    expect(replied).toHaveLength(1);
    expect(replied[0].input_hash).toBe(received[0].input_hash);
    expect(replied[0].output_hash).toBeTruthy();
    expect(replied[0].evidence.evidenceRefs).toContain(received[0].evidence.evidenceRefs[0]);
  });

  it("is idempotent per provider message", async () => {
    const ctx = makeCtx();
    const deps = makeDeps(ctx, new StubReasoner([replyOutput(), replyOutput()]));
    const msg = inbound("I need an oil change", "SM-201");
    const first = await processInboundSms(deps, msg, { now: MON_10AM });
    const second = await processInboundSms(deps, msg, { now: MON_10AM });
    expect(first.outcome).toBe("replied");
    expect(second.outcome).toBe("duplicate");
    expect(ctx.adapter.sendSms).toHaveBeenCalledTimes(1);
  });

  it("hands off on low confidence and creates a callback task", async () => {
    const ctx = makeCtx();
    const result = await processInboundSms(
      makeDeps(ctx, new StubReasoner([replyOutput({ confidence: 0.2 })])),
      inbound("asdf qwerty", "SM-202"),
      { now: MON_10AM },
    );

    expect(result).toMatchObject({ outcome: "callback_created", state: "handed_off" });
    const tasks = ctx.supabase.rowsOf("crm_tasks");
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ workspace_id: WS, status: "open" });
    expect(tasks[0].title).toContain(CALLER);
    expect(tasks[0].description).toContain("low model confidence");
    expect(ctx.adapter.sendSms.mock.calls[0][0].body).toBe(
      "Thanks for your patience — I'm handing this to the shop team. They'll call you back shortly. If it's urgent, call +12157672125.",
    );
    expect(ledgerActions(ctx, "callback_created")).toHaveLength(1);
  });

  it("corrects an illegal transition to handed_off", async () => {
    const ctx = makeCtx();
    const result = await processInboundSms(
      makeDeps(ctx, new StubReasoner([replyOutput({ suggestedState: "booked" })])),
      inbound("book me", "SM-203"),
      { now: MON_10AM },
    );
    expect(result).toMatchObject({ outcome: "callback_created", state: "handed_off" });
    expect(ledgerActions(ctx, "transition_corrected")).toHaveLength(1);
  });

  it("hands off with 'booking unavailable' when booked without a booking port", async () => {
    const ctx = makeCtx();
    mockLoadMemory.mockResolvedValue(memoryState("slot_offered", { extra: {} }));
    const result = await processInboundSms(
      makeDeps(ctx, new StubReasoner([replyOutput({ suggestedState: "booked" })])),
      inbound("yes, book the first one", "SM-204"),
      { now: MON_10AM },
    );
    expect(result).toMatchObject({ outcome: "callback_created", state: "handed_off" });
    expect(ledgerActions(ctx, "booking_unavailable")).toHaveLength(1);
    const tasks = ctx.supabase.rowsOf("crm_tasks");
    expect(tasks[0].description).toContain("booking unavailable");
  });

  it("offers real slots at slot_offered through the booking port", async () => {
    const ctx = makeCtx();
    mockLoadMemory.mockResolvedValue(
      memoryState("vehicle_known", { extra: {}, serviceId: "svc-1", need: "oil change" }),
    );
    const getSlots = jest.fn(stubPort.getSlots);
    const result = await processInboundSms(
      makeDeps(ctx, new StubReasoner([replyOutput({ suggestedState: "slot_offered" })])),
      inbound("2019 Camry", "SM-205"),
      { now: MON_10AM, bookingPort: { ...stubPort, getSlots } },
    );
    expect(result).toMatchObject({ outcome: "replied", state: "slot_offered" });
    expect(getSlots).toHaveBeenCalledTimes(1);
    const body = ctx.adapter.sendSms.mock.calls[0][0].body;
    expect(body).toContain("Tue 10:00 AM");
    expect(body).toContain("Tue 11:00 AM");
    expect(savedMemoryRow(ctx).facts.offeredSlots).toHaveLength(2);
  });

  it("hands off when the booking port has no availability", async () => {
    const ctx = makeCtx();
    mockLoadMemory.mockResolvedValue(
      memoryState("vehicle_known", { extra: {}, serviceId: "svc-1", need: "oil change" }),
    );
    const emptyPort: BookingPort = {
      ...stubPort,
      getSlots: async () => [],
    };
    const result = await processInboundSms(
      makeDeps(ctx, new StubReasoner([replyOutput({ suggestedState: "slot_offered" })])),
      inbound("2019 Camry", "SM-206"),
      { now: MON_10AM, bookingPort: emptyPort },
    );
    expect(result).toMatchObject({ outcome: "callback_created", state: "handed_off" });
    const tasks = ctx.supabase.rowsOf("crm_tasks");
    expect(tasks[0].description).toContain("no availability right now");
  });

  it("books through the injected booking port when present", async () => {
    const ctx = makeCtx();
    mockLoadMemory.mockResolvedValue(
      memoryState("slot_offered", {
        extra: {},
        serviceId: "svc-1",
        need: "oil change",
        offeredSlots: [
          { startsAt: "2026-09-29T14:00:00Z", endsAt: "2026-09-29T14:30:00Z", label: "Tue 10:00 AM" },
        ],
        chosenSlot: { startsAt: "2026-09-29T14:00:00Z", endsAt: "2026-09-29T14:30:00Z" },
      }),
    );
    ctx.supabase.pushRow("appointments", { id: "appt-1", workspace_id: WS });
    const book = jest.fn(stubPort.book);
    const result = await processInboundSms(
      makeDeps(
        ctx,
        new StubReasoner([
          replyOutput({ suggestedState: "booked", reply: "You're booked for Tue 10:00 AM!" }),
        ]),
      ),
      inbound("yes, book the first one", "SM-207"),
      { now: MON_10AM, bookingPort: { ...stubPort, book } },
    );
    expect(result).toMatchObject({ outcome: "replied", state: "booked" });
    expect(book).toHaveBeenCalledTimes(1);
    const booked = ledgerActions(ctx, "appointment_booked");
    expect(booked).toHaveLength(1);
    expect(booked[0].evidence.evidenceRefs).toContain("appt-1");
    expect(savedMemoryRow(ctx).facts.appointmentId).toBe("appt-1");
    expect(ctx.adapter.sendSms.mock.calls[0][0].body).toBe("You're booked for Tue 10:00 AM!");
  });

  it("blocks the reply when the policy gate fails (quiet hours)", async () => {
    const ctx = makeCtx();
    const result = await processInboundSms(
      makeDeps(ctx, new StubReasoner([replyOutput()])),
      inbound("I need an oil change", "SM-208"),
      { now: MON_3AM },
    );
    expect(result).toMatchObject({ outcome: "send_blocked", state: "handed_off" });
    expect(ctx.adapter.sendSms).not.toHaveBeenCalled();
    expect(ledgerActions(ctx, "send_blocked")).toHaveLength(1);
    expect(savedMemoryRow(ctx).state).toBe("handed_off");
  });

  it("writes message_logs audit rows for outbound SMS", async () => {
    const ctx = makeCtx();
    await processInboundSms(
      makeDeps(ctx, new StubReasoner([replyOutput()])),
      inbound("I need an oil change", "SM-209"),
      { now: MON_10AM },
    );
    const logs = ctx.supabase.rowsOf("message_logs");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      workspace_id: WS,
      channel: "sms",
      idempotency_key: "sms:SM-209",
      recipient_phone: CALLER,
      template_key: "shop_agent.sms_reply",
    });
  });
});

/**
 * Tests for src/server/shop-agent/channels/agentphone-webhook.ts.
 *
 * Covers event dispatch: sms → pipeline, voice → holding line, call_ended
 * → missed-call text-back, unknown → ignored. Sends go through a stub
 * ShopSmsSender (no network). The zeroai modules are real except the gates
 * require bug (faithful mock, see below) and loadMemory (state control).
 */
import { hashPhoneE164 } from "../../zeroai/types";
import type { ConversationMemory, ModelReasoner, ReasonInput, ReasonOutput } from "../../zeroai/types";
import type { ShopProfile } from "../../zeroai/types";
import {
  VOICE_HOLDING_LINE_TEMPLATE,
  handleAgentPhoneWebhook,
  resolveAgentPhoneSender,
} from "../agentphone-webhook";
import type { ShopAgentSupabase } from "../db";
import type { ShopSmsSender } from "../sending";
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

const mockLoadMemory = jest.fn(async (): Promise<ConversationMemory | null> => null);
jest.mock("../../zeroai/memory", () => {
  const actual = jest.requireActual("../../zeroai/memory");
  return {
    ...actual,
    loadMemory: (...args: any[]) => (mockLoadMemory as any)(...args),
  };
});

// The real gates.ts has a broken require("../policy"); mirror its documented
// behavior faithfully (reported to the owning worker).
jest.mock("../../zeroai/gates", () => {
  const { checkPolicy } = jest.requireActual("../../zeroai/policy");
  return {
    checkGate: async (gate: string, ctx: any) => {
      if (gate === "policy_check") {
        if (!ctx.policyAction) return { gate, passed: false, reason: "no policy action provided" };
        const decision = (checkPolicy as any)(ctx.policyAction, ctx.policyCtx ?? {});
        return decision.decision === "act"
          ? { gate, passed: true, reason: `policy approved: ${decision.ruleId}` }
          : { gate, passed: false, reason: `policy ${decision.decision}: ${decision.reason}` };
      }
      if (gate === "slot_exists") {
        return ctx.slots && ctx.slots.length > 0
          ? { gate, passed: true, reason: "slots available" }
          : { gate, passed: false, reason: "no slots available" };
      }
      if (gate === "appointment_verified") {
        if (!ctx.appointmentLookup || !ctx.appointmentId)
          return { gate, passed: false, reason: "missing lookup/id" };
        const verified = await ctx.appointmentLookup(ctx.appointmentId);
        return verified
          ? { gate, passed: true, reason: "verified" }
          : { gate, passed: false, reason: "not verified" };
      }
      return { gate, passed: false, reason: `unknown gate: ${gate}` };
    },
  };
});

jest.mock("../../booking", () => ({ bookingPort: null }));

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MON_10AM = new Date("2026-09-28T14:00:00Z"); // Mon 10:00 AM EDT
const MON_10PM = new Date("2026-09-29T02:00:00Z"); // Mon 10:00 PM EDT

interface Ctx {
  supabase: FakeSupabase;
  db: ShopAgentSupabase;
  sender: ShopSmsSender & { sendSms: jest.Mock };
}

function makeCtx(): Ctx {
  const supabase = new FakeSupabase({
    provider_connections: [
      {
        workspace_id: WS,
        provider: "agentphone",
        metadata: { agent_id: "ag-1", number_id: "num-1", inbound_number: SHOP_NUMBER },
      },
    ],
  });
  let seq = 0;
  const sender = {
    providerName: "agentphone",
    sendSms: jest.fn(async () => {
      seq += 1;
      return {
        providerMessageId: `SM-ap-${seq}`,
        providerName: "agentphone",
        status: "sent" as const,
        acceptedAt: new Date().toISOString(),
      };
    }),
  };
  return { supabase, db: supabase as unknown as ShopAgentSupabase, sender };
}

function deps(ctx: Ctx, reasoner: ModelReasoner | null) {
  return {
    supabase: ctx.db,
    senderFor: async () => ctx.sender as ShopSmsSender,
    reasoner,
  };
}

const smsEvent = (body: string, overrides: Record<string, any> = {}) => ({
  event: "agent.message",
  channel: "sms",
  agentId: "ag-1",
  data: {
    conversationId: "conv-1",
    numberId: "num-1",
    from: CALLER,
    to: SHOP_NUMBER,
    message: body,
    direction: "inbound",
    ...overrides,
  },
});

const callEndedEvent = (data: Record<string, any>) => ({
  event: "agent.call_ended",
  channel: "voice",
  agentId: "ag-1",
  data: { callId: "call-1", ...data },
});

function ledgerActions(ctx: Ctx, action: string): any[] {
  return ctx.supabase.rowsOf("shop_agent_ledger").filter((r) => r.action === action);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLoadMemory.mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("agent.message (sms)", () => {
  it("routes inbound SMS through the pipeline (STOP end-to-end)", async () => {
    const ctx = makeCtx();
    const result = await handleAgentPhoneWebhook(
      deps(ctx, new StubReasoner([])),
      smsEvent("STOP"),
      "agent.message",
      { now: MON_10AM },
    );
    expect(result.body).toEqual({ ok: true });
    const rows = ctx.supabase.rowsOf("messaging_suppressions");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ channel: "sms", phone: CALLER, reason: "unsubscribe" });
    expect(ledgerActions(ctx, "stop_received")).toHaveLength(1);
  });

  it("runs the conversation pipeline for a normal message", async () => {
    const ctx = makeCtx();
    const reasoner = new StubReasoner([
      {
        reply: "What service do you need?",
        extractedFacts: {},
        suggestedState: "need_identified",
        confidence: 0.9,
      },
    ]);
    const result = await handleAgentPhoneWebhook(
      deps(ctx, reasoner),
      smsEvent("I need an oil change"),
      "agent.message",
      { now: MON_10AM },
    );
    expect(result.body).toEqual({ ok: true });
    expect(reasoner.calls).toHaveLength(1);
    expect(ctx.sender.sendSms).toHaveBeenCalledTimes(1);
    expect(ledgerActions(ctx, "sms_replied")).toHaveLength(1);
  });

  it("ignores outbound echoes (never feeds our own sends to the pipeline)", async () => {
    const ctx = makeCtx();
    const reasoner = new StubReasoner([]);
    const result = await handleAgentPhoneWebhook(
      deps(ctx, reasoner),
      smsEvent("hello", { direction: "outbound" }),
      "agent.message",
      { now: MON_10AM },
    );
    expect(result.body).toEqual({ ok: true });
    expect(reasoner.calls).toHaveLength(0);
    expect(ledgerActions(ctx, "webhook_ignored")).toHaveLength(1);
  });

  it("skips gracefully when no reasoner is configured", async () => {
    const ctx = makeCtx();
    const result = await handleAgentPhoneWebhook(deps(ctx, null), smsEvent("hello"), "agent.message", {
      now: MON_10AM,
    });
    expect(result.body).toEqual({ ok: true });
    expect(ctx.sender.sendSms).not.toHaveBeenCalled();
    expect(ledgerActions(ctx, "pipeline_skipped_no_reasoner")).toHaveLength(1);
  });

  it("returns ok for an unknown workspace", async () => {
    const ctx = makeCtx();
    ctx.supabase.tables["provider_connections"] = [];
    const result = await handleAgentPhoneWebhook(
      deps(ctx, new StubReasoner([])),
      smsEvent("hello"),
      "agent.message",
      { now: MON_10AM },
    );
    expect(result.body).toEqual({ ok: true });
    expect(ctx.sender.sendSms).not.toHaveBeenCalled();
  });
});

describe("agent.message (voice turn)", () => {
  it("returns the deterministic holding line and logs, with no model and no SMS", async () => {
    const ctx = makeCtx();
    const reasoner = new StubReasoner([]);
    const result = await handleAgentPhoneWebhook(
      deps(ctx, reasoner),
      {
        event: "agent.message",
        channel: "voice",
        agentId: "ag-1",
        data: { from: CALLER, to: SHOP_NUMBER, message: "hello?", direction: "inbound" },
      },
      "agent.message",
      { now: MON_10AM },
    );
    expect(result.body).toEqual({
      text: VOICE_HOLDING_LINE_TEMPLATE.replace("{businessName}", "MOMS Mobile Oil Change"),
    });
    expect(reasoner.calls).toHaveLength(0);
    expect(ctx.sender.sendSms).not.toHaveBeenCalled();
    expect(ledgerActions(ctx, "voice_turn_held")).toHaveLength(1);
  });
});

describe("agent.call_ended", () => {
  it("sends a text-back for a missed call (empty transcript)", async () => {
    const ctx = makeCtx();
    const result = await handleAgentPhoneWebhook(
      deps(ctx, new StubReasoner([])),
      callEndedEvent({ from: CALLER, to: SHOP_NUMBER, durationSeconds: 0, transcript: "" }),
      "agent.call_ended",
      { now: MON_10AM },
    );
    expect(result.body).toEqual({ ok: true });
    expect(ctx.sender.sendSms).toHaveBeenCalledTimes(1);
    const req = ctx.sender.sendSms.mock.calls[0][0];
    expect(req.to).toBe(CALLER);
    expect(req.body).toContain("MOMS Mobile Oil Change");
    expect(req.idempotencyKey).toBe("textback:call-1");
    const sent = ledgerActions(ctx, "textback_sent");
    expect(sent).toHaveLength(1);
    expect(sent[0].actor).toBe(hashPhoneE164(CALLER));
  });

  it("does not text when the call was answered", async () => {
    const ctx = makeCtx();
    const result = await handleAgentPhoneWebhook(
      deps(ctx, new StubReasoner([])),
      callEndedEvent({
        from: CALLER,
        to: SHOP_NUMBER,
        durationSeconds: 120,
        transcript: "hi i need an oil change tomorrow thanks bye",
      }),
      "agent.call_ended",
      { now: MON_10AM },
    );
    expect(result.body).toEqual({ ok: true });
    expect(ctx.sender.sendSms).not.toHaveBeenCalled();
    expect(ledgerActions(ctx, "call_answered_or_ignored")).toHaveLength(1);
  });

  it("dedupes a second call_ended for the same call within 4h", async () => {
    const ctx = makeCtx();
    const d = deps(ctx, new StubReasoner([]));
    const payload = callEndedEvent({ from: CALLER, to: SHOP_NUMBER, durationSeconds: 0, transcript: "" });
    await handleAgentPhoneWebhook(d, payload, "agent.call_ended", { now: MON_10AM });
    // Backdate the sent entry to the first call's time.
    await ctx.db.from("shop_agent_ledger").update({ occurred_at: MON_10AM.toISOString() }).eq("action", "textback_sent");
    await handleAgentPhoneWebhook(
      d,
      payload,
      "agent.call_ended",
      { now: new Date("2026-09-28T15:00:00Z") },
    );
    expect(ctx.sender.sendSms).toHaveBeenCalledTimes(1);
    expect(ledgerActions(ctx, "textback_deduped")).toHaveLength(1);
  });

  it("defers the text-back in quiet hours (phone kept for the sweep)", async () => {
    const ctx = makeCtx();
    await handleAgentPhoneWebhook(
      deps(ctx, new StubReasoner([])),
      callEndedEvent({ from: CALLER, to: SHOP_NUMBER, durationSeconds: 0, transcript: "" }),
      "agent.call_ended",
      { now: MON_10PM },
    );
    expect(ctx.sender.sendSms).not.toHaveBeenCalled();
    const deferred = ledgerActions(ctx, "textback_deferred");
    expect(deferred).toHaveLength(1);
    expect(deferred[0].evidence.evidenceRefs[0]).toBe("call-1");
    expect(deferred[0].evidence.evidenceRefs[1]).toBe(CALLER);
  });

  it("logs call_ended_unresolved when the caller number is missing", async () => {
    const ctx = makeCtx();
    const result = await handleAgentPhoneWebhook(
      deps(ctx, new StubReasoner([])),
      callEndedEvent({ durationSeconds: 0, transcript: "" }),
      "agent.call_ended",
      { now: MON_10AM },
    );
    expect(result.body).toEqual({ ok: true });
    expect(ctx.sender.sendSms).not.toHaveBeenCalled();
    expect(ledgerActions(ctx, "call_ended_unresolved")).toHaveLength(1);
  });
});

describe("unknown events", () => {
  it("logs webhook_ignored and returns 200", async () => {
    const ctx = makeCtx();
    const result = await handleAgentPhoneWebhook(
      deps(ctx, new StubReasoner([])),
      { event: "agent.reaction", data: { to: SHOP_NUMBER } },
      "agent.reaction",
      { now: MON_10AM },
    );
    expect(result.body).toEqual({ ok: true });
    expect(ledgerActions(ctx, "webhook_ignored")).toHaveLength(1);
    expect(ctx.sender.sendSms).not.toHaveBeenCalled();
  });
});

describe("resolveAgentPhoneSender", () => {
  it("returns null when the API key is absent (fail closed)", async () => {
    const saved = process.env.AGENTPHONE_API_KEY;
    delete process.env.AGENTPHONE_API_KEY;
    try {
      const ctx = makeCtx();
      await expect(resolveAgentPhoneSender(ctx.db, WS)).resolves.toBeNull();
    } finally {
      if (saved !== undefined) process.env.AGENTPHONE_API_KEY = saved;
    }
  });

  it("builds an adapter from provider_connections metadata", async () => {
    process.env.AGENTPHONE_API_KEY = "test-key";
    try {
      const ctx = makeCtx();
      const adapter = await resolveAgentPhoneSender(ctx.db, WS);
      expect(adapter).toBeTruthy();
      expect(adapter?.providerName).toBe("agentphone");
    } finally {
      delete process.env.AGENTPHONE_API_KEY;
    }
  });
});

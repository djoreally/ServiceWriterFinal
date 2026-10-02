/**
 * Tests for src/server/shop-agent/channels/sweep.ts.
 *
 * The sender is injected per workspace (stub — no network). Deferred
 * text-backs carry the caller phone in the ledger event's evidenceRefs[1].
 */
import { hashPhoneE164 } from "../../zeroai/types";
import type { ShopProfile } from "../../zeroai/types";
import { sweepDueActions } from "../sweep";
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
  isWithinBusinessHours: jest.fn(() => true),
}));

const mockLoadMemory = jest.fn(async () => null);
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
        const decision = (checkPolicy as any)(ctx.policyAction, ctx.policyCtx ?? {});
        return decision.decision === "act"
          ? { gate, passed: true, reason: "ok" }
          : { gate, passed: false, reason: `policy ${decision.decision}` };
      }
      if (gate === "slot_exists") {
        return ctx.slots?.length
          ? { gate, passed: true, reason: "slots" }
          : { gate, passed: false, reason: "no slots" };
      }
      return { gate, passed: false, reason: "unknown" };
    },
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MON_830AM = new Date("2026-09-28T12:30:00Z"); // Mon 8:30 AM EDT
const MON_1030AM = new Date("2026-09-28T14:30:00Z"); // Mon 10:30 AM EDT

interface Ctx {
  supabase: FakeSupabase;
  db: ShopAgentSupabase;
  sender: ShopSmsSender & { sendSms: jest.Mock };
}

function makeCtx(): Ctx {
  const supabase = new FakeSupabase({});
  let seq = 0;
  const sender = {
    providerName: "agentphone",
    sendSms: jest.fn(async () => {
      seq += 1;
      return {
        providerMessageId: `SM-sweep-${seq}`,
        providerName: "agentphone",
        status: "sent" as const,
        acceptedAt: new Date().toISOString(),
      };
    }),
  };
  return {
    supabase,
    db: supabase as unknown as ShopAgentSupabase,
    sender,
  };
}

const depsFor = (ctx: Ctx) => ({
  senderFor: async () => ctx.sender as ShopSmsSender,
});

function ledgerActions(ctx: Ctx, action?: string): any[] {
  const rows = ctx.supabase.rowsOf("shop_agent_ledger");
  return action ? rows.filter((r) => r.action === action) : rows;
}

function seedDeferred(ctx: Ctx, callRef: string, deferredAtIso: string) {
  ctx.supabase.pushRow("shop_agent_ledger", {
    event_id: "evt-seed-deferred",
    workspace_id: WS,
    actor: hashPhoneE164(CALLER),
    action: "textback_deferred",
    occurred_at: deferredAtIso,
    input_hash: `textback:${callRef}`,
    evidence: { evidenceRefs: [callRef, CALLER] },
  });
}

function seedTextBackSent(ctx: Ctx, callRef: string, sentAtIso: string, messageId = "SM-111") {
  ctx.supabase.pushRow("shop_agent_ledger", {
    event_id: `evt-seed-sent-${callRef}`,
    workspace_id: WS,
    actor: hashPhoneE164(CALLER),
    action: "textback_sent",
    occurred_at: sentAtIso,
    input_hash: `textback:${callRef}`,
    evidence: { evidenceRefs: [callRef, messageId] },
  });
  ctx.supabase.pushRow("message_logs", {
    id: `ml-${callRef}`,
    workspace_id: WS,
    channel: "sms",
    idempotency_key: `textback:${callRef}`,
    recipient_phone: CALLER,
    provider_message_id: messageId,
    template_key: "shop_agent.textback",
    status: "sent",
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLoadMemory.mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("sweepDueActions", () => {
  it("sends deferred text-backs once quiet hours open (idempotent)", async () => {
    const ctx = makeCtx();
    // Deferred Sunday 11:00 PM EDT.
    seedDeferred(ctx, "call-999", "2026-09-28T03:00:00Z");

    const first = await sweepDueActions(ctx.db, { ...depsFor(ctx), now: MON_830AM });
    expect(first.deferredSent).toBe(1);
    expect(ctx.sender.sendSms).toHaveBeenCalledTimes(1);
    const req = ctx.sender.sendSms.mock.calls[0][0];
    expect(req.idempotencyKey).toBe("textback:call-999");
    expect(req.to).toBe(CALLER);
    expect(req.body).toContain("MOMS Mobile Oil Change");
    expect(ledgerActions(ctx, "textback_sent")).toHaveLength(1);

    // Second run: the text-back is now within the 4h window → skip.
    const second = await sweepDueActions(ctx.db, { ...depsFor(ctx), now: MON_830AM });
    expect(second.deferredSent).toBe(0);
    expect(ctx.sender.sendSms).toHaveBeenCalledTimes(1);
  });

  it("does not send deferred text-backs while quiet hours are still closed", async () => {
    const ctx = makeCtx();
    seedDeferred(ctx, "call-999", "2026-09-28T03:00:00Z");
    const result = await sweepDueActions(ctx.db, {
      ...depsFor(ctx),
      now: new Date("2026-09-28T11:00:00Z"), // Mon 7:00 AM EDT
    });
    expect(result.deferredSent).toBe(0);
    expect(ctx.sender.sendSms).not.toHaveBeenCalled();
  });

  it("skips deferred sends when no sender is configured", async () => {
    const ctx = makeCtx();
    seedDeferred(ctx, "call-999", "2026-09-28T03:00:00Z");
    const result = await sweepDueActions(ctx.db, {
      senderFor: async () => null,
      now: MON_830AM,
    });
    expect(result.deferredSent).toBe(0);
    expect(result.deferredSkipped).toBe(1);
  });

  it("sends one nudge after 2h of silence, never a second", async () => {
    const ctx = makeCtx();
    // Text-back sent Mon 8:00 AM EDT; sweep at 10:30 AM EDT.
    seedTextBackSent(ctx, "call-111", "2026-09-28T12:00:00Z");

    const first = await sweepDueActions(ctx.db, { ...depsFor(ctx), now: MON_1030AM });
    expect(first.nudgesSent).toBe(1);
    const nudgeReq = ctx.sender.sendSms.mock.calls[0][0];
    expect(nudgeReq.body).toBe("Still need a hand? Reply here and I'll get you sorted.");
    expect(nudgeReq.idempotencyKey).toBe("nudge:call-111");
    expect(ledgerActions(ctx, "nudge_sent")).toHaveLength(1);

    const second = await sweepDueActions(ctx.db, { ...depsFor(ctx), now: MON_1030AM });
    expect(second.nudgesSent).toBe(0);
    expect(ctx.sender.sendSms).toHaveBeenCalledTimes(1);
  });

  it("skips the nudge when the customer replied recently", async () => {
    const ctx = makeCtx();
    seedTextBackSent(ctx, "call-111", "2026-09-28T12:00:00Z");
    ctx.supabase.pushRow("inbound_messages", {
      id: "im-1",
      workspace_id: WS,
      channel: "sms",
      provider: "agentphone",
      provider_event_id: "conv-1",
      from_address: CALLER,
      to_address: SHOP_NUMBER,
      body: "how much for an oil change?",
      status: "received",
      received_at: "2026-09-28T14:00:00Z",
    });

    const result = await sweepDueActions(ctx.db, { ...depsFor(ctx), now: MON_1030AM });
    expect(result.nudgesSent).toBe(0);
    expect(ctx.sender.sendSms).not.toHaveBeenCalled();
  });

  it("skips the nudge for conversations that already advanced", async () => {
    const ctx = makeCtx();
    seedTextBackSent(ctx, "call-111", "2026-09-28T12:00:00Z");
    mockLoadMemory.mockResolvedValueOnce({
      workspaceId: WS,
      callerHash: hashPhoneE164(CALLER),
      state: "slot_offered",
      facts: { extra: {} },
      summary: "",
      turnCount: 3,
      updatedAt: new Date().toISOString(),
      expiresAt: new Date().toISOString(),
    });

    const result = await sweepDueActions(ctx.db, { ...depsFor(ctx), now: MON_1030AM });
    expect(result.nudgesSent).toBe(0);
    expect(ctx.sender.sendSms).not.toHaveBeenCalled();
  });

  it("does not nudge before the 2h mark", async () => {
    const ctx = makeCtx();
    // Text-back 1h ago only.
    seedTextBackSent(ctx, "call-111", "2026-09-28T13:30:00Z");
    const result = await sweepDueActions(ctx.db, { ...depsFor(ctx), now: MON_1030AM });
    expect(result.nudgesSent).toBe(0);
    expect(ctx.sender.sendSms).not.toHaveBeenCalled();
  });
});

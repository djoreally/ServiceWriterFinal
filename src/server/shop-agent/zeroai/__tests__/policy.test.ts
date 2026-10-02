import {
  checkPolicy,
  isHelpMessage,
  isQuietHours,
  isStopMessage,
} from "../policy";
import type { PolicyContext } from "../types";

const baseCtx: PolicyContext = {
  workspaceId: "ws-1",
  localTimeMinutes: 12 * 60, // noon — inside quiet-hours window
};

describe("policy table", () => {
  it("answer_faq -> act", () => {
    const d = checkPolicy("answer_faq", baseCtx);
    expect(d.decision).toBe("act");
    expect(d.ruleId).toBe("policy.faq.act");
  });

  it("send_booking_confirmation -> act", () => {
    const d = checkPolicy("send_booking_confirmation", baseCtx);
    expect(d.decision).toBe("act");
    expect(d.ruleId).toBe("policy.booking-confirm.act");
  });

  it("create_appointment -> act only inside hours AND service area", () => {
    const ok = checkPolicy("create_appointment", {
      ...baseCtx,
      withinBusinessHours: true,
      withinServiceArea: true,
    });
    expect(ok.decision).toBe("act");
    expect(ok.ruleId).toBe("policy.appointment.act");

    const noHours = checkPolicy("create_appointment", {
      ...baseCtx,
      withinBusinessHours: false,
      withinServiceArea: true,
    });
    expect(noHours.decision).toBe("blocked");
    expect(noHours.ruleId).toBe("policy.appointment.blocked");

    const noArea = checkPolicy("create_appointment", {
      ...baseCtx,
      withinBusinessHours: true,
      withinServiceArea: false,
    });
    expect(noArea.decision).toBe("blocked");
    expect(noArea.ruleId).toBe("policy.appointment.blocked");

    const unknown = checkPolicy("create_appointment", baseCtx);
    expect(unknown.decision).toBe("blocked");
  });

  it("quote_price -> act only from profile prices", () => {
    const ok = checkPolicy("quote_price", {
      ...baseCtx,
      priceFromProfile: true,
    });
    expect(ok.decision).toBe("act");
    expect(ok.ruleId).toBe("policy.quote.act");

    const invented = checkPolicy("quote_price", {
      ...baseCtx,
      priceFromProfile: false,
    });
    expect(invented.decision).toBe("blocked");
    expect(invented.ruleId).toBe("policy.quote.no-invented-prices");
  });

  it("promise_callback -> act", () => {
    const d = checkPolicy("promise_callback", baseCtx);
    expect(d.decision).toBe("act");
    expect(d.ruleId).toBe("policy.callback.act");
  });

  it("offer_discount -> draft", () => {
    const d = checkPolicy("offer_discount", baseCtx);
    expect(d.decision).toBe("draft");
    expect(d.ruleId).toBe("policy.discount.draft");
  });

  it("send_message -> act when clean", () => {
    const d = checkPolicy("send_message", baseCtx);
    expect(d.decision).toBe("act");
    expect(d.ruleId).toBe("policy.send.act");
  });
});

describe("suppression overrides everything", () => {
  it("optedOut blocks send_message even inside quiet-hours window", () => {
    const d = checkPolicy("send_message", {
      ...baseCtx,
      optedOut: true,
    });
    expect(d.decision).toBe("blocked");
    expect(d.ruleId).toBe("policy.suppression.blocked");
  });

  it("optedOut wins over quiet hours (checked first)", () => {
    const d = checkPolicy("send_message", {
      ...baseCtx,
      optedOut: true,
      localTimeMinutes: 3 * 60, // also quiet hours
    });
    expect(d.ruleId).toBe("policy.suppression.blocked");
  });
});

describe("quiet hours", () => {
  const at = (h: number, m: number) =>
    checkPolicy("send_message", {
      ...baseCtx,
      localTimeMinutes: h * 60 + m,
    });

  it("blocks 07:59", () => expect(at(7, 59).ruleId).toBe("policy.quiet-hours.blocked"));
  it("allows 08:00", () => expect(at(8, 0).ruleId).toBe("policy.send.act"));
  it("allows 20:59", () => expect(at(20, 59).ruleId).toBe("policy.send.act"));
  it("blocks 21:00", () => expect(at(21, 0).ruleId).toBe("policy.quiet-hours.blocked"));
  it("blocks midnight", () => expect(at(0, 0).decision).toBe("blocked"));

  it("fails closed when local time is unknown", () => {
    const d = checkPolicy("send_message", { workspaceId: "ws-1" });
    expect(d.decision).toBe("blocked");
    expect(d.ruleId).toBe("policy.quiet-hours.blocked");
  });

  it("isQuietHours helper matches the boundary", () => {
    expect(isQuietHours(479)).toBe(true);
    expect(isQuietHours(480)).toBe(false);
    expect(isQuietHours(1259)).toBe(false);
    expect(isQuietHours(1260)).toBe(true);
  });
});

describe("STOP / HELP matchers", () => {
  it.each(["STOP", "stop", " Stop ", "STOPALL", "unsubscribe", "QUIT", "CANCEL", "END"])(
    "treats %p as STOP",
    (body) => expect(isStopMessage(body)).toBe(true),
  );

  it.each(["HELP", "help", " Help ", "INFO", "info"])(
    "treats %p as HELP",
    (body) => expect(isHelpMessage(body)).toBe(true),
  );

  it.each(["stop please", "please stop", "stopstop", "helper", "stops", ""])(
    "does not match %p (exact match only)",
    (body) => {
      expect(isStopMessage(body)).toBe(false);
      expect(isHelpMessage(body)).toBe(false);
    },
  );
});

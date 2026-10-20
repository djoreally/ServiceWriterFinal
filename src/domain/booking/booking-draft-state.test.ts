import { describe, expect, it } from "vitest";
import {
  advanceBookingDraft,
  assertDraftReadyToCommit,
  type BookingDraftState,
} from "./booking-draft-state";

const now = new Date("2026-10-14T12:00:00Z");
const draft: BookingDraftState = {
  id: "draft-1",
  version: 0,
  status: "editing",
  currentStep: "customer",
  completedSteps: [],
  expiresAt: "2026-10-15T12:00:00Z",
};

describe("booking draft state contract", () => {
  it("advances only after validated current step and increments version", () => {
    expect(advanceBookingDraft(draft, 0, "customer", now)).toMatchObject({
      version: 1,
      currentStep: "location",
      completedSteps: ["customer"],
    });
  });

  it("rejects stale concurrent writes", () => {
    expect(() => advanceBookingDraft(draft, 1, "customer", now)).toThrow("STALE_DRAFT_VERSION");
  });

  it("rejects out-of-order advancement", () => {
    expect(() => advanceBookingDraft(draft, 0, "location", now)).toThrow("STEP_OUT_OF_ORDER");
  });

  it("rejects expired or committed drafts", () => {
    expect(() => advanceBookingDraft({ ...draft, expiresAt: now.toISOString() }, 0, "customer", now)).toThrow("DRAFT_EXPIRED");
    expect(() => advanceBookingDraft({ ...draft, status: "committed" }, 0, "customer", now)).toThrow("DRAFT_NOT_EDITABLE");
  });

  it("requires all prior steps before commit", () => {
    expect(() => assertDraftReadyToCommit({ ...draft, currentStep: "review" }, now)).toThrow("INCOMPLETE_DRAFT");
    expect(() => assertDraftReadyToCommit(draft, now)).toThrow("DRAFT_NOT_AT_REVIEW");
    expect(() => assertDraftReadyToCommit({
      ...draft,
      currentStep: "review",
      completedSteps: ["customer", "location", "vehicles", "services", "schedule"],
    }, now)).not.toThrow();
  });
});

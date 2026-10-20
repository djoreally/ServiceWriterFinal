/**
 * Booking draft lifecycle contract.
 *
 * Pure domain logic: no browser storage, React, network, or database calls.
 * The API and database must enforce these same transitions independently.
 */
export const BOOKING_DRAFT_STEPS = [
  "customer",
  "location",
  "vehicles",
  "services",
  "schedule",
  "review",
] as const;

export type BookingDraftStep = (typeof BOOKING_DRAFT_STEPS)[number];
export type BookingDraftStatus = "editing" | "committing" | "committed" | "expired";

export interface BookingDraftState {
  id: string;
  version: number;
  status: BookingDraftStatus;
  currentStep: BookingDraftStep;
  completedSteps: BookingDraftStep[];
  expiresAt: string;
}

export class BookingDraftConflict extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookingDraftConflict";
  }
}

export function assertDraftEditable(draft: BookingDraftState, now: Date): void {
  if (draft.status !== "editing") throw new BookingDraftConflict("DRAFT_NOT_EDITABLE");
  if (!Number.isInteger(draft.version) || draft.version < 0) throw new BookingDraftConflict("INVALID_DRAFT_VERSION");
  const expires = Date.parse(draft.expiresAt);
  if (!Number.isFinite(expires) || expires <= now.getTime()) throw new BookingDraftConflict("DRAFT_EXPIRED");
}

export function advanceBookingDraft(
  draft: BookingDraftState,
  expectedVersion: number,
  validatedStep: BookingDraftStep,
  now: Date,
): BookingDraftState {
  assertDraftEditable(draft, now);
  if (draft.version !== expectedVersion) throw new BookingDraftConflict("STALE_DRAFT_VERSION");
  if (draft.currentStep !== validatedStep) throw new BookingDraftConflict("STEP_OUT_OF_ORDER");
  const index = BOOKING_DRAFT_STEPS.indexOf(validatedStep);
  if (index === -1 || index === BOOKING_DRAFT_STEPS.length - 1) {
    throw new BookingDraftConflict("FINAL_REVIEW_REQUIRES_COMMIT");
  }
  const completed = new Set(draft.completedSteps);
  completed.add(validatedStep);
  return {
    ...draft,
    version: draft.version + 1,
    completedSteps: BOOKING_DRAFT_STEPS.filter((step) => completed.has(step)),
    currentStep: BOOKING_DRAFT_STEPS[index + 1],
  };
}

export function assertDraftReadyToCommit(draft: BookingDraftState, now: Date): void {
  assertDraftEditable(draft, now);
  if (draft.currentStep !== "review") throw new BookingDraftConflict("DRAFT_NOT_AT_REVIEW");
  for (const step of BOOKING_DRAFT_STEPS.slice(0, -1)) {
    if (!draft.completedSteps.includes(step)) throw new BookingDraftConflict("INCOMPLETE_DRAFT");
  }
}

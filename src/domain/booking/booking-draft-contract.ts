import { z } from "zod";
import { BOOKING_DRAFT_STEPS } from "./booking-draft-state";

/**
 * Shared request contracts for resumable booking drafts.
 * Server authorization must resolve workspace from the public booking slug,
 * hash a cryptographically random resume token, and never return the hash.
 */
export const bookingDraftStepSchema = z.enum(BOOKING_DRAFT_STEPS);

export const bookingDraftCreateSchema = z.object({
  bookingSlug: z.string().trim().min(1).max(160),
}).strict();

export const bookingDraftSaveSchema = z.object({
  draftId: z.string().uuid(),
  expectedVersion: z.number().int().nonnegative(),
  step: bookingDraftStepSchema,
  // Each step has its own server-side schema; no arbitrary unvalidated
  // client-supplied payload may be persisted or merged into a booking.
  data: z.record(z.string(), z.unknown()),
}).strict();

export const bookingDraftCommitSchema = z.object({
  draftId: z.string().uuid(),
  expectedVersion: z.number().int().nonnegative(),
  idempotencyKey: z.string().uuid(),
}).strict();

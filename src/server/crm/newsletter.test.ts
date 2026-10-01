jest.mock("@/lib/supabase", () => ({
  createSupabaseAdminClient: jest.fn(),
}));
jest.mock("@/server/messaging/lifecycle-sender", () => ({
  sendLifecycleEmail: jest.fn(),
}));

import { createSupabaseAdminClient } from "@/lib/supabase";
import { sendLifecycleEmail } from "@/server/messaging/lifecycle-sender";
import { NEWSLETTER_ISSUES } from "@/server/newsletter/moms-content";
import { enrollNewsletterFromBooking, processDueNewsletterSubscribers } from "@/server/crm/newsletter";

const sendLifecycleEmailMock = sendLifecycleEmail as jest.Mock;

interface FakeQuery {
  data: unknown;
  error: unknown;
  select: jest.Mock;
  eq: jest.Mock;
  not: jest.Mock;
  lte: jest.Mock;
  order: jest.Mock;
  limit: jest.Mock;
  insert: jest.Mock;
  upsert: jest.Mock;
  update: jest.Mock;
  maybeSingle: jest.Mock;
  single: jest.Mock;
}

/**
 * Minimal Supabase query-builder fake. Chainable methods return the same
 * object, `maybeSingle`/`single` resolve terminal payloads, and awaiting the
 * object itself yields `{ data, error }` (Supabase postgrest builders are
 * thenable, and several call sites await the chain directly).
 */
function fakeQuery(opts: {
  data?: unknown;
  error?: unknown;
  maybeSingleData?: unknown;
  singleData?: unknown;
} = {}): FakeQuery {
  const q = {} as FakeQuery;
  q.data = opts.data ?? null;
  q.error = opts.error ?? null;
  for (const name of ["select", "eq", "not", "lte", "order", "limit", "insert", "upsert", "update"] as const) {
    q[name] = jest.fn().mockReturnValue(q);
  }
  q.maybeSingle = jest.fn().mockResolvedValue({ data: opts.maybeSingleData ?? null, error: opts.error ?? null });
  q.single = jest.fn().mockResolvedValue({ data: opts.singleData ?? null, error: opts.error ?? null });
  return q;
}

function subscriberRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub-1",
    workspace_id: "ws-1",
    user_id: "user-1",
    email: "customer@example.com",
    status: "active",
    booking_slug: "momsoilchange",
    unsubscribe_token: "tok-xyz",
    welcome_sent_at: null,
    next_issue_number: 1,
    next_send_at: new Date(Date.now() - 1000).toISOString(),
    ...overrides,
  };
}

function adminWith(tables: Record<string, FakeQuery>) {
  const admin = { from: jest.fn((table: string) => {
    const table_ = tables[table];
    if (!table_) throw new Error(`Unexpected table ${table}`);
    return table_;
  }) };
  (createSupabaseAdminClient as jest.Mock).mockReturnValue(admin);
  return admin;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

describe("enrollNewsletterFromBooking", () => {
  const enrollInput = {
    workspaceId: "ws-1",
    ownerUserId: "user-1",
    customerId: "cust-9",
    email: "  NewCustomer@Example.com ",
    bookingSlug: "momsoilchange",
    businessName: "MOMS Mobile Oil Change",
  };

  beforeEach(() => {
    sendLifecycleEmailMock.mockResolvedValue({ status: "accepted", providerMessageId: "msg-1" });
  });

  it("normalizes the email and scopes lookups to the workspace", async () => {
    const subscribers = fakeQuery({
      maybeSingleData: null,
      singleData: subscriberRow({ email: "newcustomer@example.com" }),
    });
    const sequences = fakeQuery({ maybeSingleData: { id: "seq-1" } });
    const templates = fakeQuery();
    adminWith({ newsletter_subscribers: subscribers, newsletter_sequences: sequences, newsletter_templates: templates });

    await enrollNewsletterFromBooking(enrollInput);

    expect(subscribers.eq).toHaveBeenCalledWith("workspace_id", "ws-1");
    expect(subscribers.eq).toHaveBeenCalledWith("email", "newcustomer@example.com");
    const upsertPayload = subscribers.upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(upsertPayload.email).toBe("newcustomer@example.com");
    expect(upsertPayload.workspace_id).toBe("ws-1");
    expect(upsertPayload.customer_id).toBe("cust-9");
    expect(subscribers.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active", source: "public_booking", booking_slug: "momsoilchange" }),
      { onConflict: "workspace_id,email" },
    );
  });

  it("seeds the MOMS 52-week sequence and templates for the momsoilchange booking slug", async () => {
    const subscribers = fakeQuery({ maybeSingleData: null, singleData: subscriberRow() });
    const sequences = fakeQuery({ maybeSingleData: { id: "seq-1" } });
    const templates = fakeQuery();
    adminWith({ newsletter_subscribers: subscribers, newsletter_sequences: sequences, newsletter_templates: templates });

    await enrollNewsletterFromBooking(enrollInput);

    const rows = templates.upsert.mock.calls[0][0] as Record<string, unknown>[];
    expect(rows).toHaveLength(52);
    expect(rows[0]).toEqual(expect.objectContaining({
      workspace_id: "ws-1",
      user_id: "user-1",
      sequence_id: "seq-1",
      month_number: 1,
      subject: NEWSLETTER_ISSUES[0].subject,
      seasonal_theme: NEWSLETTER_ISSUES[0].category,
      is_active: true,
    }));
    expect(rows[51]).toEqual(expect.objectContaining({ month_number: 52 }));
    expect(String(rows[0].content)).toContain(NEWSLETTER_ISSUES[0].headline);
    expect(templates.upsert).toHaveBeenCalledWith(expect.any(Array), { onConflict: "sequence_id,month_number" });
  });

  it("creates the sequence row when none exists yet", async () => {
    const subscribers = fakeQuery({ maybeSingleData: null, singleData: subscriberRow() });
    const sequences = fakeQuery({ maybeSingleData: null, singleData: { id: "seq-new" } });
    const templates = fakeQuery();
    adminWith({ newsletter_subscribers: subscribers, newsletter_sequences: sequences, newsletter_templates: templates });

    await enrollNewsletterFromBooking(enrollInput);

    expect(sequences.insert).toHaveBeenCalledWith(expect.objectContaining({
      workspace_id: "ws-1",
      user_id: "user-1",
      name: "MOMS 52-Week Newsletter",
      is_active: true,
    }));
    const rows = templates.upsert.mock.calls[0][0] as Record<string, unknown>[];
    expect(rows[0]).toEqual(expect.objectContaining({ sequence_id: "seq-new" }));
  });

  it("skips sequence seeding for other booking slugs", async () => {
    const subscribers = fakeQuery({ maybeSingleData: null, singleData: subscriberRow() });
    const admin = adminWith({ newsletter_subscribers: subscribers });

    await enrollNewsletterFromBooking({ ...enrollInput, bookingSlug: "acmeshop" });

    expect(admin.from).not.toHaveBeenCalledWith("newsletter_sequences");
    expect(admin.from).not.toHaveBeenCalledWith("newsletter_templates");
    expect(sendLifecycleEmailMock).toHaveBeenCalledTimes(1);
  });

  it("sends the welcome email and stamps welcome_sent_at for a new subscriber", async () => {
    const subscribers = fakeQuery({ maybeSingleData: null, singleData: subscriberRow() });
    const sequences = fakeQuery({ maybeSingleData: { id: "seq-1" } });
    const templates = fakeQuery();
    adminWith({ newsletter_subscribers: subscribers, newsletter_sequences: sequences, newsletter_templates: templates });

    const before = Date.now();
    const result = await enrollNewsletterFromBooking(enrollInput);

    expect(result).toEqual(expect.objectContaining({ welcomeSent: true, alreadyActive: false }));
    expect(result.subscriber).toEqual(expect.objectContaining({ id: "sub-1" }));
    expect(sendLifecycleEmailMock).toHaveBeenCalledTimes(1);
    const call = sendLifecycleEmailMock.mock.calls[0][0] as Record<string, unknown>;
    expect(call).toEqual(expect.objectContaining({
      workspaceId: "ws-1",
      recipientEmail: "newcustomer@example.com",
      customerId: "cust-9",
      templateKey: "newsletter.welcome",
    }));
    expect(String(call.idempotencyKey)).toMatch(/^newsletter:welcome:sub-1:/);
    const variables = call.variables as Record<string, unknown>;
    expect(variables["business.name"]).toBe("MOMS Mobile Oil Change");
    expect(variables["email.primary_action_url"]).toBe("https://momsoilchange.servicewriter.xyz");
    expect(String(variables["email.preferences_url"])).toContain("/api/v1/newsletter/preferences?token=tok-xyz");

    const updatePayload = subscribers.update.mock.calls[0][0] as Record<string, unknown>;
    expect(updatePayload.welcome_message_id).toBe("msg-1");
    expect(updatePayload.next_issue_number).toBe(1);
    expect(typeof updatePayload.welcome_sent_at).toBe("string");
    const nextSendAt = new Date(String(updatePayload.next_send_at)).getTime();
    expect(nextSendAt).toBeGreaterThanOrEqual(before + SEVEN_DAYS_MS - 60_000);
    expect(nextSendAt).toBeLessThanOrEqual(Date.now() + SEVEN_DAYS_MS + 60_000);
    expect(subscribers.update.mock.calls[0][1]).toBeUndefined();
  });

  it("is idempotent for an already-welcomed active subscriber", async () => {
    const subscribers = fakeQuery({
      maybeSingleData: { id: "sub-1", status: "active", welcome_sent_at: "2026-09-01T00:00:00.000Z" },
      singleData: subscriberRow({ welcome_sent_at: "2026-09-01T00:00:00.000Z" }),
    });
    const sequences = fakeQuery({ maybeSingleData: { id: "seq-1" } });
    const templates = fakeQuery();
    adminWith({ newsletter_subscribers: subscribers, newsletter_sequences: sequences, newsletter_templates: templates });

    const result = await enrollNewsletterFromBooking(enrollInput);

    expect(result).toEqual(expect.objectContaining({ welcomeSent: false, alreadyActive: true }));
    expect(sendLifecycleEmailMock).not.toHaveBeenCalled();
    expect(subscribers.update).not.toHaveBeenCalled();
  });

  it("re-sends the welcome when a previous subscriber never got one", async () => {
    const subscribers = fakeQuery({
      maybeSingleData: { id: "sub-1", status: "unsubscribed", welcome_sent_at: null },
      singleData: subscriberRow({ status: "active" }),
    });
    const sequences = fakeQuery({ maybeSingleData: { id: "seq-1" } });
    const templates = fakeQuery();
    adminWith({ newsletter_subscribers: subscribers, newsletter_sequences: sequences, newsletter_templates: templates });

    const result = await enrollNewsletterFromBooking(enrollInput);

    expect(result).toEqual(expect.objectContaining({ welcomeSent: true, alreadyActive: false }));
    expect(sendLifecycleEmailMock).toHaveBeenCalledTimes(1);
    const upsertPayload = subscribers.upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(upsertPayload.next_issue_number).toBe(1);
  });

  it("records a suppressed welcome without a timestamp", async () => {
    sendLifecycleEmailMock.mockResolvedValue({ status: "suppressed" });
    const subscribers = fakeQuery({ maybeSingleData: null, singleData: subscriberRow() });
    const sequences = fakeQuery({ maybeSingleData: { id: "seq-1" } });
    const templates = fakeQuery();
    adminWith({ newsletter_subscribers: subscribers, newsletter_sequences: sequences, newsletter_templates: templates });

    const result = await enrollNewsletterFromBooking(enrollInput);

    expect(result).toEqual(expect.objectContaining({ welcomeSent: false, alreadyActive: false }));
    const updatePayload = subscribers.update.mock.calls[0][0] as Record<string, unknown>;
    expect(updatePayload.welcome_sent_at).toBeNull();
    expect(updatePayload.welcome_message_id).toBeNull();
  });

  it("throws when the previous-subscriber lookup fails", async () => {
    const subscribers = fakeQuery({ error: { message: "db down" } });
    adminWith({ newsletter_subscribers: subscribers });

    await expect(enrollNewsletterFromBooking(enrollInput)).rejects.toEqual({ message: "db down" });
    expect(sendLifecycleEmailMock).not.toHaveBeenCalled();
  });

  it("throws when the subscriber upsert fails", async () => {
    const subscribers = fakeQuery({ maybeSingleData: null, error: { message: "upsert failed" } });
    const sequences = fakeQuery({ maybeSingleData: { id: "seq-1" } });
    const templates = fakeQuery();
    adminWith({ newsletter_subscribers: subscribers, newsletter_sequences: sequences, newsletter_templates: templates });

    await expect(enrollNewsletterFromBooking(enrollInput)).rejects.toEqual({ message: "upsert failed" });
    expect(sendLifecycleEmailMock).not.toHaveBeenCalled();
  });
});

describe("processDueNewsletterSubscribers", () => {
  beforeEach(() => {
    sendLifecycleEmailMock.mockResolvedValue({ status: "accepted", providerMessageId: "msg-week" });
  });

  it("no-ops on an empty due queue", async () => {
    const subscribers = fakeQuery({ data: [] });
    adminWith({ newsletter_subscribers: subscribers });

    const result = await processDueNewsletterSubscribers();

    expect(result).toEqual({ claimed: 0, sent: 0, failed: 0, completed: 0, suppressed: 0 });
    expect(sendLifecycleEmailMock).not.toHaveBeenCalled();
  });

  it("clamps the batch limit between 1 and 50", async () => {
    const subscribers = fakeQuery({ data: [] });
    adminWith({ newsletter_subscribers: subscribers });

    await processDueNewsletterSubscribers(0);
    expect(subscribers.limit).toHaveBeenCalledWith(1);

    await processDueNewsletterSubscribers(500);
    expect(subscribers.limit).toHaveBeenCalledWith(50);
  });

  it("retries the welcome for a due subscriber that never received one", async () => {
    const row = subscriberRow({ welcome_sent_at: null, next_issue_number: 1 });
    const subscribers = fakeQuery({ data: [row] });
    const workspaces = fakeQuery({ singleData: { name: "MOMS Mobile Oil Change" } });
    adminWith({ newsletter_subscribers: subscribers, workspaces });

    const result = await processDueNewsletterSubscribers();

    expect(result).toEqual({ claimed: 1, sent: 0, failed: 0, completed: 0, suppressed: 0 });
    expect(sendLifecycleEmailMock).toHaveBeenCalledTimes(1);
    const call = sendLifecycleEmailMock.mock.calls[0][0] as Record<string, unknown>;
    expect(call).toEqual(expect.objectContaining({
      workspaceId: "ws-1",
      recipientEmail: "customer@example.com",
      templateKey: "newsletter.welcome",
      idempotencyKey: "newsletter:welcome:sub-1:retry",
    }));
    const variables = call.variables as Record<string, unknown>;
    expect(variables["business.name"]).toBe("MOMS Mobile Oil Change");
    expect(variables["email.primary_action_url"]).toBe("https://momsoilchange.servicewriter.xyz");

    const updatePayload = subscribers.update.mock.calls[0][0] as Record<string, unknown>;
    expect(typeof updatePayload.welcome_sent_at).toBe("string");
    expect(updatePayload.welcome_message_id).toBe("msg-week");
    expect(updatePayload.next_issue_number).toBe(1);
    expect(new Date(String(updatePayload.next_send_at)).getTime()).toBeGreaterThan(Date.now() + SEVEN_DAYS_MS - 60_000);
  });

  it("unsubscribes a subscriber whose retried welcome is suppressed", async () => {
    sendLifecycleEmailMock.mockResolvedValue({ status: "suppressed" });
    const row = subscriberRow({ welcome_sent_at: null });
    const subscribers = fakeQuery({ data: [row] });
    const workspaces = fakeQuery({ singleData: { name: "MOMS Mobile Oil Change" } });
    adminWith({ newsletter_subscribers: subscribers, workspaces });

    const result = await processDueNewsletterSubscribers();

    expect(result).toEqual({ claimed: 1, sent: 0, failed: 0, completed: 0, suppressed: 1 });
    const updatePayload = subscribers.update.mock.calls[0][0] as Record<string, unknown>;
    expect(updatePayload).toEqual(expect.objectContaining({
      status: "unsubscribed",
      next_send_at: null,
    }));
  });

  it("sends the due weekly issue and advances the subscriber", async () => {
    const row = subscriberRow({ welcome_sent_at: "2026-09-01T00:00:00.000Z", next_issue_number: 3 });
    const subscribers = fakeQuery({ data: [row] });
    const workspaces = fakeQuery({ singleData: { name: "MOMS Mobile Oil Change" } });
    const sequences = fakeQuery({ maybeSingleData: { id: "seq-1" } });
    const templates = fakeQuery({
      maybeSingleData: {
        id: "tpl-3",
        subject: "Week 3 subject",
        preview_text: "Week 3 preheader",
        content: "Week 3 headline\n\nWeek 3 body paragraph.\n\nCTA: Book now\n\nURL: https://book.example/checkout",
      },
    });
    const deliveries = fakeQuery();
    adminWith({
      newsletter_subscribers: subscribers,
      workspaces,
      newsletter_sequences: sequences,
      newsletter_templates: templates,
      newsletter_deliveries: deliveries,
    });

    const result = await processDueNewsletterSubscribers();

    expect(result).toEqual({ claimed: 1, sent: 1, failed: 0, completed: 0, suppressed: 0 });
    expect(sequences.eq).toHaveBeenCalledWith("name", "MOMS 52-Week Newsletter");
    expect(templates.eq).toHaveBeenCalledWith("sequence_id", "seq-1");
    expect(templates.eq).toHaveBeenCalledWith("month_number", 3);

    const call = sendLifecycleEmailMock.mock.calls[0][0] as Record<string, unknown>;
    expect(call).toEqual(expect.objectContaining({
      templateKey: "newsletter.weekly",
      idempotencyKey: "newsletter:sub-1:week:3",
    }));
    const variables = call.variables as Record<string, unknown>;
    expect(variables["newsletter.subject"]).toBe("Week 3 subject");
    expect(variables["newsletter.preheader"]).toBe("Week 3 preheader");
    expect(variables["newsletter.headline"]).toBe("Week 3 headline");
    expect(variables["newsletter.body"]).toBe("Week 3 body paragraph.");
    expect(variables["newsletter.week"]).toBe(3);
    expect(variables["email.primary_action_url"]).toBe("https://book.example/checkout");

    const deliveryPayload = deliveries.upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(deliveryPayload).toEqual(expect.objectContaining({
      workspace_id: "ws-1",
      subscriber_id: "sub-1",
      template_id: "tpl-3",
      issue_number: 3,
      provider_message_id: "msg-week",
      status: "accepted",
    }));
    expect(deliveries.upsert).toHaveBeenCalledWith(expect.any(Object), { onConflict: "subscriber_id,issue_number" });

    const updatePayload = subscribers.update.mock.calls[0][0] as Record<string, unknown>;
    expect(updatePayload.next_issue_number).toBe(4);
    expect(new Date(String(updatePayload.next_send_at)).getTime()).toBeGreaterThan(Date.now() + SEVEN_DAYS_MS - 60_000);
  });

  it("completes the subscriber after the final issue", async () => {
    const row = subscriberRow({ welcome_sent_at: "2026-09-01T00:00:00.000Z", next_issue_number: 52 });
    const subscribers = fakeQuery({ data: [row] });
    const workspaces = fakeQuery({ singleData: { name: "MOMS Mobile Oil Change" } });
    const sequences = fakeQuery({ maybeSingleData: { id: "seq-1" } });
    const templates = fakeQuery({
      maybeSingleData: { id: "tpl-52", subject: "s", preview_text: "p", content: "h\n\nb" },
    });
    const deliveries = fakeQuery();
    adminWith({
      newsletter_subscribers: subscribers,
      workspaces,
      newsletter_sequences: sequences,
      newsletter_templates: templates,
      newsletter_deliveries: deliveries,
    });

    const result = await processDueNewsletterSubscribers();

    expect(result).toEqual({ claimed: 1, sent: 1, failed: 0, completed: 1, suppressed: 0 });
    const updatePayload = subscribers.update.mock.calls[0][0] as Record<string, unknown>;
    expect(updatePayload.next_issue_number).toBe(53);
    expect(updatePayload.next_send_at).toBeNull();
  });

  it("retires a subscriber whose next issue is past week 52", async () => {
    const row = subscriberRow({ welcome_sent_at: "2026-09-01T00:00:00.000Z", next_issue_number: 53 });
    const subscribers = fakeQuery({ data: [row] });
    adminWith({ newsletter_subscribers: subscribers });

    const result = await processDueNewsletterSubscribers();

    expect(result).toEqual({ claimed: 1, sent: 0, failed: 0, completed: 1, suppressed: 0 });
    expect(sendLifecycleEmailMock).not.toHaveBeenCalled();
    const updatePayload = subscribers.update.mock.calls[0][0] as Record<string, unknown>;
    expect(updatePayload).toEqual({ next_send_at: null });
  });

  it("unsubscribes a subscriber whose weekly send is suppressed", async () => {
    sendLifecycleEmailMock.mockResolvedValue({ status: "suppressed" });
    const row = subscriberRow({ welcome_sent_at: "2026-09-01T00:00:00.000Z", next_issue_number: 2 });
    const subscribers = fakeQuery({ data: [row] });
    const workspaces = fakeQuery({ singleData: { name: "MOMS Mobile Oil Change" } });
    const sequences = fakeQuery({ maybeSingleData: { id: "seq-1" } });
    const templates = fakeQuery({
      maybeSingleData: { id: "tpl-2", subject: "s", preview_text: "p", content: "h\n\nb" },
    });
    const deliveries = fakeQuery();
    adminWith({
      newsletter_subscribers: subscribers,
      workspaces,
      newsletter_sequences: sequences,
      newsletter_templates: templates,
      newsletter_deliveries: deliveries,
    });

    const result = await processDueNewsletterSubscribers();

    expect(result).toEqual({ claimed: 1, sent: 0, failed: 0, completed: 0, suppressed: 1 });
    const deliveryPayload = deliveries.upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(deliveryPayload.status).toBe("suppressed");
    const updatePayload = subscribers.update.mock.calls[0][0] as Record<string, unknown>;
    expect(updatePayload).toEqual(expect.objectContaining({ status: "unsubscribed", next_send_at: null }));
  });

  it("records a failed delivery when the provider throws", async () => {
    sendLifecycleEmailMock.mockRejectedValue(new Error("provider exploded"));
    const row = subscriberRow({ welcome_sent_at: "2026-09-01T00:00:00.000Z", next_issue_number: 2 });
    const subscribers = fakeQuery({ data: [row] });
    const workspaces = fakeQuery({ singleData: { name: "MOMS Mobile Oil Change" } });
    const sequences = fakeQuery({ maybeSingleData: { id: "seq-1" } });
    const templates = fakeQuery({
      maybeSingleData: { id: "tpl-2", subject: "s", preview_text: "p", content: "h\n\nb" },
    });
    const deliveries = fakeQuery();
    adminWith({
      newsletter_subscribers: subscribers,
      workspaces,
      newsletter_sequences: sequences,
      newsletter_templates: templates,
      newsletter_deliveries: deliveries,
    });

    const result = await processDueNewsletterSubscribers();

    expect(result).toEqual({ claimed: 1, sent: 0, failed: 1, completed: 0, suppressed: 0 });
    const deliveryPayload = deliveries.upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(deliveryPayload).toEqual(expect.objectContaining({
      subscriber_id: "sub-1",
      issue_number: 2,
      status: "failed",
      error_message: "provider exploded",
    }));
  });

  it("records a failed delivery when the issue template is missing", async () => {
    const row = subscriberRow({ welcome_sent_at: "2026-09-01T00:00:00.000Z", next_issue_number: 7 });
    const subscribers = fakeQuery({ data: [row] });
    const workspaces = fakeQuery({ singleData: { name: "MOMS Mobile Oil Change" } });
    const sequences = fakeQuery({ maybeSingleData: { id: "seq-1" } });
    const templates = fakeQuery({ maybeSingleData: null });
    const deliveries = fakeQuery();
    adminWith({
      newsletter_subscribers: subscribers,
      workspaces,
      newsletter_sequences: sequences,
      newsletter_templates: templates,
      newsletter_deliveries: deliveries,
    });

    const result = await processDueNewsletterSubscribers();

    expect(result).toEqual({ claimed: 1, sent: 0, failed: 1, completed: 0, suppressed: 0 });
    const deliveryPayload = deliveries.upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(deliveryPayload).toEqual(expect.objectContaining({
      status: "failed",
      error_message: "Missing newsletter issue 7",
    }));
    expect(sendLifecycleEmailMock).not.toHaveBeenCalled();
  });

  it("throws when the due query itself fails", async () => {
    const subscribers = fakeQuery({ error: { message: "db down" } });
    adminWith({ newsletter_subscribers: subscribers });

    await expect(processDueNewsletterSubscribers()).rejects.toEqual({ message: "db down" });
  });
});

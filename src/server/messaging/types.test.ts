import { messagePurposeSchema, requiredEnv, sendMessageSchema } from "@/server/messaging/types";

const UUID = "00000000-0000-4000-8000-000000000001";

function basePayload() {
  return {
    workspaceId: UUID,
    recipient: { email: "customer@example.com" },
    purpose: "transactional",
    templateKey: "appointment_booking_sequence.booking_confirmation",
    body: "Your appointment is confirmed.",
    idempotencyKey: "lifecycle:test:recipient@example.com",
  };
}

describe("messagePurposeSchema", () => {
  it.each([
    "transactional",
    "service_reminder",
    "appointment_update",
    "payment_request",
    "marketing",
    "authentication",
  ])("accepts %s", (purpose) => {
    expect(messagePurposeSchema.safeParse(purpose).success).toBe(true);
  });

  it("rejects unknown purposes", () => {
    expect(messagePurposeSchema.safeParse("spam").success).toBe(false);
    expect(messagePurposeSchema.safeParse("TRANSACTIONAL").success).toBe(false);
    expect(messagePurposeSchema.safeParse("").success).toBe(false);
    expect(messagePurposeSchema.safeParse(undefined).success).toBe(false);
  });
});

describe("sendMessageSchema", () => {
  it("accepts a valid email recipient payload and defaults metadata", () => {
    const result = sendMessageSchema.parse(basePayload());
    expect(result.recipient.email).toBe("customer@example.com");
    expect(result.metadata).toEqual({});
    expect(result.subject).toBeUndefined();
    expect(result.html).toBeUndefined();
  });

  it("accepts a phone-only recipient", () => {
    const result = sendMessageSchema.parse({
      ...basePayload(),
      recipient: { phone: "+15551234567" },
    });
    expect(result.recipient.phone).toBe("+15551234567");
  });

  it("rejects a recipient with neither email nor phone", () => {
    expect(sendMessageSchema.safeParse({ ...basePayload(), recipient: {} }).success).toBe(false);
  });

  it("rejects an invalid email recipient", () => {
    expect(
      sendMessageSchema.safeParse({ ...basePayload(), recipient: { email: "not-an-email" } }).success,
    ).toBe(false);
  });

  it("rejects a phone number that is too short or too long", () => {
    expect(
      sendMessageSchema.safeParse({ ...basePayload(), recipient: { phone: "123456" } }).success,
    ).toBe(false);
    expect(
      sendMessageSchema.safeParse({
        ...basePayload(),
        recipient: { phone: "+1".padEnd(34, "0") },
      }).success,
    ).toBe(false);
  });

  it("rejects invalid channel-adjacent fields: non-uuid workspace, unknown purpose, blank template/body", () => {
    expect(
      sendMessageSchema.safeParse({ ...basePayload(), workspaceId: "not-a-uuid" }).success,
    ).toBe(false);
    expect(sendMessageSchema.safeParse({ ...basePayload(), purpose: "spam" }).success).toBe(false);
    expect(sendMessageSchema.safeParse({ ...basePayload(), templateKey: "   " }).success).toBe(
      false,
    );
    expect(sendMessageSchema.safeParse({ ...basePayload(), body: "" }).success).toBe(false);
  });

  it("requires an idempotency key of at least 16 characters", () => {
    expect(sendMessageSchema.safeParse({ ...basePayload(), idempotencyKey: "short-key" }).success).toBe(
      false,
    );
    expect(sendMessageSchema.safeParse({ ...basePayload(), idempotencyKey: undefined }).success).toBe(
      false,
    );
  });

  it("rejects an invalid replyTo while accepting optional fields", () => {
    expect(
      sendMessageSchema.safeParse({ ...basePayload(), replyTo: "not-an-email" }).success,
    ).toBe(false);
    const result = sendMessageSchema.parse({
      ...basePayload(),
      subject: "  Hello  ",
      html: "<p>hi</p>",
      fromName: "Shop",
      replyTo: "shop@example.com",
    });
    expect(result.subject).toBe("Hello");
    expect(result.replyTo).toBe("shop@example.com");
  });

  it("rejects metadata values that are not strings", () => {
    expect(
      sendMessageSchema.safeParse({ ...basePayload(), metadata: { count: 3 } }).success,
    ).toBe(false);
  });
});

describe("requiredEnv", () => {
  const NAME = "TEST_REQUIRED_ENV_UNIT";

  afterEach(() => {
    delete process.env[NAME];
  });

  it("returns the value when set", () => {
    process.env[NAME] = "some-value";
    expect(requiredEnv(NAME)).toBe("some-value");
  });

  it("trims surrounding whitespace", () => {
    process.env[NAME] = "  padded  ";
    expect(requiredEnv(NAME)).toBe("padded");
  });

  it("throws when the variable is missing", () => {
    expect(() => requiredEnv(NAME)).toThrow(`Missing required environment variable: ${NAME}`);
  });

  it("treats an empty or whitespace-only value as missing", () => {
    process.env[NAME] = "";
    expect(() => requiredEnv(NAME)).toThrow(`Missing required environment variable: ${NAME}`);
    process.env[NAME] = "   ";
    expect(() => requiredEnv(NAME)).toThrow(`Missing required environment variable: ${NAME}`);
  });
});

import { isTechMessageChannelEnabled, normalizeTechNotificationPreferences } from "@/lib/technician-notification-preferences";

describe("technician-notification-preferences", () => {
  it("defaults external customer channels off until explicitly enabled", () => {
    const prefs = normalizeTechNotificationPreferences(null);

    expect(isTechMessageChannelEnabled(prefs, "dispatch")).toBe(true);
    expect(isTechMessageChannelEnabled(prefs, "customer_sms")).toBe(false);
    expect(isTechMessageChannelEnabled(prefs, "customer_email")).toBe(false);
  });

  it("honors explicit per-channel preferences", () => {
    const prefs = normalizeTechNotificationPreferences({ customerSmsEnabled: true, customerEmailEnabled: true });

    expect(isTechMessageChannelEnabled(prefs, "customer_sms")).toBe(true);
    expect(isTechMessageChannelEnabled(prefs, "customer_email")).toBe(true);
  });
});

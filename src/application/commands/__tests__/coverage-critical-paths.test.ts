import { supabase } from "@/integrations/supabase/client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { createNotification } from "@/application/commands/notifications.command";
import { defaultTirePricingRule, calculateTireServiceTotal } from "@/lib/tire-pricing";
import { defaultDetailingRule } from "@/lib/detailing-pricing";
import { saveDetailingPricingRulesForService } from "../detailing-pricing.command";
import { saveTireServicePricingRule } from "../tire-pricing.command";
import { fetchTireServicePricingRules } from "../../queries/tire-pricing.query";
import {
  bookAppointmentSafe,
  insertBookingAppointmentServices,
  saveAppointmentBookingConfiguration,
  updateBookingAppointment,
} from "../booking-submit.command";
import {
  notifyBookingUpdate,
  notifyLowInventory,
  notifyNewBooking,
  notifyPaymentReceived,
} from "@/lib/notifications";

jest.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(),
    auth: { signUp: jest.fn() },
  },
}));
jest.mock("@/lib/auth/current-user", () => ({ getCurrentAuthUser: jest.fn() }));
jest.mock("@/application/commands/notifications.command", () => ({ createNotification: jest.fn() }));

const rpc = supabase.rpc as jest.Mock;
const from = supabase.from as jest.Mock;
const authUser = getCurrentAuthUser as jest.Mock;
const createNotificationMock = createNotification as jest.Mock;

describe("coverage-critical persistence contracts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authUser.mockResolvedValue({ data: { user: { id: "provider-1" } }, error: null });
    rpc.mockResolvedValue({ data: null, error: null });
    createNotificationMock.mockResolvedValue(true);
  });

  it("serializes service-scoped detailing rules through the RPC", async () => {
    const rule = defaultDetailingRule("large", "heavy");
    await saveDetailingPricingRulesForService("service-detailing", [rule]);
    expect(rpc).toHaveBeenCalledWith("replace_detailing_pricing_rules_for_service", {
      p_service_catalog_id: "service-detailing",
      p_rules: [expect.objectContaining({
        size_tier: "large",
        condition: "heavy",
        price_multiplier: rule.priceMultiplier,
        quote_required: true,
      })],
    });
  });

  it("rejects pricing writes without an authenticated provider", async () => {
    authUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(saveTireServicePricingRule(defaultTirePricingRule("service-tire"))).rejects.toThrow("Not authenticated");
    await expect(saveDetailingPricingRulesForService(null, [defaultDetailingRule("compact", "light")])).rejects.toThrow("Not authenticated");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("persists tire policy fields and normalizes legacy query rows", async () => {
    const rule = { ...defaultTirePricingRule("service-tire"), baseInstallationPrice: 44, maximumQuantity: 6, allowsManualFitment: false };
    const upsert = jest.fn().mockResolvedValue({ error: null });
    from.mockReturnValueOnce({ upsert });
    await saveTireServicePricingRule(rule);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "provider-1",
      service_catalog_id: "service-tire",
      base_installation_price: 44,
      maximum_quantity: 6,
      allows_manual_fitment: false,
    }), { onConflict: "user_id,service_catalog_id" });

    const select = jest.fn().mockReturnThis();
    const order = jest.fn().mockResolvedValue({ data: [{ service_catalog_id: "service-tire", base_installation_price: "22.5", allows_manual_fitment: false }], error: null });
    from.mockReturnValueOnce({ select, order });
    const rows = await fetchTireServicePricingRules();
    expect(order).toHaveBeenCalledWith("created_at");
    expect(rows[0]).toMatchObject({ serviceCatalogId: "service-tire", baseInstallationPrice: 22.5, allowsManualFitment: false, maximumQuantity: 4 });
  });

  it("keeps tire calculation options quantity-aware", () => {
    const rule = { ...defaultTirePricingRule("tire"), baseInstallationPrice: 50, mountBalancePrice: 10, tpmsServicePrice: 7, disposalPrice: 4, alignmentPrice: 30 };
    expect(calculateTireServiceTotal(rule, 4, { mountBalance: true, tpms: true, disposal: true, alignment: true })).toBe(314);
    expect(calculateTireServiceTotal(rule, 1)).toBe(50);
  });

  it("preserves vehicle-scoped booking persistence payloads", async () => {
    await bookAppointmentSafe({ p_booking_slug: "provider-booking", p_scheduled_date: "2026-08-20", p_scheduled_time: "10:00", p_duration_minutes: 90, p_title: "Two vehicles", p_guest_name: "Customer", p_guest_email: "customer@example.com", p_guest_phone: null, p_description: "Vehicle 1 oil; Vehicle 2 tires", p_notes: null, p_estimated_cost: 300, p_tax_amount: 24, p_service_catalog_id: null, p_vehicle_id: null });
    expect(rpc).toHaveBeenCalledWith("public_booking_book_appointment", expect.objectContaining({ p_status: "confirmed", p_vehicle_id: null }));
    const configuration = { version: 1, vehicles: [{ clientVehicleId: "vehicle-1", services: [{ id: "oil", name: "Oil", price: 90, quantity: 1 }] }, { clientVehicleId: "vehicle-2", services: [{ id: "tires", name: "Tires", price: 210, quantity: 4 }] }] } as never;
    await saveAppointmentBookingConfiguration("appointment-1", "provider-booking", configuration);
    expect(rpc).toHaveBeenCalledWith("public_booking_save_configuration", expect.objectContaining({ p_appointment_id: "appointment-1", p_configuration: configuration }));
    await insertBookingAppointmentServices("appointment-1", "provider-booking", [{ vehicle_id: "persisted-1", service_catalog_id: "oil", name: "Oil", price: 90, quantity: 1, is_prepaid: false }, { vehicle_id: "persisted-2", service_catalog_id: "tires", name: "Tire", price: 210, quantity: 4, is_prepaid: false }]);
    expect(rpc).toHaveBeenCalledWith("public_booking_insert_services", expect.objectContaining({ p_services: expect.arrayContaining([expect.objectContaining({ vehicle_id: "persisted-2", quantity: 4 })]) }));
  });

  it("covers appointment update persistence and notification payloads", async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const update = jest.fn().mockReturnValue({ eq });
    from.mockReturnValue({ update });
    await updateBookingAppointment("appointment-1", { status: "confirmed" });
    expect(update).toHaveBeenCalledWith({ status: "confirmed" });
    expect(eq).toHaveBeenCalledWith("id", "appointment-1");

    await notifyLowInventory("Tire", 2, 4);
    await notifyNewBooking("Customer", "Tire installation", "2026-08-20");
    await notifyPaymentReceived("Customer", "$210");
    await notifyBookingUpdate("completed", "Customer", "Tires");
    expect(createNotificationMock).toHaveBeenCalledTimes(4);
    expect(createNotificationMock).toHaveBeenLastCalledWith(expect.objectContaining({ type: "booking_update", message: "Customer's Tires has been completed" }));
  });
});

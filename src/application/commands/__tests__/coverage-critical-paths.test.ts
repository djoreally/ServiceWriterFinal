import { supabase } from "@/integrations/supabase/client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { createNotification } from "@/application/commands/notifications.command";
import { apiClient } from "@/lib/api-client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import { defaultTirePricingRule, calculateTireServiceTotal } from "@/lib/tire-pricing";
import { defaultDetailingRule } from "@/lib/detailing-pricing";
import { saveDetailingPricingRulesForService } from "../detailing-pricing.command";
import { saveTireServicePricingRule } from "../tire-pricing.command";
import { fetchTireServicePricingRules } from "../../queries/tire-pricing.query";
import {
  bookAppointmentSafe,
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
jest.mock("@/lib/api-client", () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));
jest.mock("@/application/queries/settings.query", () => ({ resolveCurrentWorkspace: jest.fn() }));
jest.mock("@/lib/auth/current-user", () => ({ getCurrentAuthUser: jest.fn() }));
jest.mock("@/application/commands/notifications.command", () => ({ createNotification: jest.fn() }));

const rpc = supabase.rpc as jest.Mock;
const from = supabase.from as jest.Mock;
const authUser = getCurrentAuthUser as jest.Mock;
const createNotificationMock = createNotification as jest.Mock;
const resolveWorkspace = resolveCurrentWorkspace as jest.Mock;
const apiPut = apiClient.put as jest.Mock;
const apiGet = apiClient.get as jest.Mock;
const apiPost = apiClient.post as jest.Mock;

describe("coverage-critical persistence contracts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authUser.mockResolvedValue({ data: { user: { id: "provider-1" } }, error: null });
    resolveWorkspace.mockResolvedValue({ workspaceId: "ws-1" });
    rpc.mockResolvedValue({ data: null, error: null });
    createNotificationMock.mockResolvedValue(true);
  });

  it("serializes service-scoped detailing rules through the API", async () => {
    const rule = defaultDetailingRule("large", "heavy");
    apiPost.mockResolvedValue({ data: null });
    await saveDetailingPricingRulesForService("service-detailing", [rule]);
    expect(apiPost).toHaveBeenCalledWith("/v1/detailing-pricing/rules-for-service", {
      workspace_id: "ws-1",
      service_catalog_id: "service-detailing",
      rules: [expect.objectContaining({
        size_tier: "large",
        condition: "heavy",
        price_multiplier: rule.priceMultiplier,
        quote_required: true,
      })],
    });
  });

  it("rejects pricing writes without an authenticated workspace", async () => {
    resolveWorkspace.mockResolvedValue(null);
    await expect(saveTireServicePricingRule(defaultTirePricingRule("service-tire"))).rejects.toThrow("Select a workspace before saving tire pricing.");
    await expect(saveDetailingPricingRulesForService(null, [defaultDetailingRule("compact", "light")])).rejects.toThrow("Select a workspace before saving detailing pricing.");
    expect(apiPut).not.toHaveBeenCalled();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("persists tire policy fields and normalizes legacy query rows", async () => {
    const rule = { ...defaultTirePricingRule("service-tire"), baseInstallationPrice: 44, maximumQuantity: 6, allowsManualFitment: false };
    apiPut.mockResolvedValue({ data: null });
    await saveTireServicePricingRule(rule);
    expect(apiPut).toHaveBeenCalledWith("/v1/tire-pricing/rules", {
      rule,
      selected_workspace_id: "ws-1",
    });

    apiGet.mockResolvedValue({ data: [{ service_catalog_id: "service-tire", base_installation_price: "22.5", allows_manual_fitment: false }] });
    const rows = await fetchTireServicePricingRules();
    expect(apiGet).toHaveBeenCalledWith("/v1/tire-pricing/rules", { query: { selected_workspace_id: "ws-1" } });
    expect(rows[0]).toMatchObject({ serviceCatalogId: "service-tire", baseInstallationPrice: 22.5, allowsManualFitment: false, maximumQuantity: 4 });
  });

  it("keeps tire calculation options quantity-aware", () => {
    const rule = { ...defaultTirePricingRule("tire"), baseInstallationPrice: 50, mountBalancePrice: 10, tpmsServicePrice: 7, disposalPrice: 4, alignmentPrice: 30 };
    expect(calculateTireServiceTotal(rule, 4, { mountBalance: true, tpms: true, disposal: true, alignment: true })).toBe(314);
    expect(calculateTireServiceTotal(rule, 1)).toBe(50);
  });

  it("persists each vehicle service under the atomic Hono booking contract", async () => {
    apiPost.mockResolvedValue({ data: "appointment-1", error: null });
    await bookAppointmentSafe({
      p_submission_key: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      p_booking_slug: "provider-booking", p_scheduled_date: "2026-11-20",
      p_scheduled_time: "10:00", p_duration_minutes: 90, p_title: "Two vehicles",
      p_guest_name: "Customer", p_guest_email: "customer@example.com",
      p_guest_phone: "+12155551234", p_description: "Vehicle 1 oil; Vehicle 2 tires",
      p_notes: null, p_estimated_cost: 300, p_tax_amount: 0,
      p_service_catalog_id: null, p_vehicle_id: "11111111-1111-4111-8111-111111111111",
      p_location_address: "123 Test Street, Philadelphia, PA 19103",
      p_location_lat: null, p_location_lng: null,
      p_configuration: {
        schemaVersion: 2, capturedAt: "2026-10-18T00:00:00Z",
        vehicles: [],
      },
      p_services: [
        { vehicle_id: "11111111-1111-4111-8111-111111111111", service_catalog_id: null, name: "Oil", price: 90, quantity: 1, is_prepaid: false },
        { vehicle_id: "22222222-2222-4222-8222-222222222222", service_catalog_id: null, name: "Tire", price: 210, quantity: 4, is_prepaid: false },
      ],
    });
    expect(apiPost).toHaveBeenCalledWith(
      "/v1/public-bookings/appointments",
      expect.objectContaining({
        p_submission_key: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        p_services: expect.arrayContaining([
          expect.objectContaining({ vehicle_id: "22222222-2222-4222-8222-222222222222", quantity: 4 }),
        ]),
      }),
    );
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

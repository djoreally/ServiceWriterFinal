jest.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: jest.fn(),
  },
}));

import { supabase } from "@/integrations/supabase/client";
import { fetchBookingProfile } from "@/application/queries/booking.query";

describe("fetchBookingProfile public booking constraints", () => {
  const mockRpc = supabase.rpc as jest.Mock;

  beforeEach(() => {
    mockRpc.mockReset();
  });

  it("returns null when slug lookup fails", async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error("not found") });

    const result = await fetchBookingProfile("missing-shop");

    expect(result).toBeNull();
    expect(mockRpc).toHaveBeenCalledWith("get_public_booking_profile_v2", {
      booking_slug_param: "missing-shop",
    });
  });

  it("returns null when no public profile exists", async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    const result = await fetchBookingProfile("no-public-profile");

    expect(result).toBeNull();
  });

  it("maps public profile fields, applies safe defaults, and never includes stripe_account_id", async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          user_id: "owner-1",
          business_name: "Acme Auto",
          logo_url: "https://cdn.example.com/logo.png",
          opening_time: "08:00",
          closing_time: "17:00",
          working_days: ["monday", "tuesday"],
          currency: "USD",
          service_radius_miles: 15,
          service_address: "123 Main St",
          service_coordinates: { lat: 30.1, lng: -97.7 },
          buffer_time_before: null,
          buffer_time_after: null,
          min_lead_time_hours: null,
          max_advance_days: null,
          slot_duration_minutes: null,
          stripe_charges_enabled: false,
          phone: "555-1234",
          email: "acme@example.com",
          google_review_url: null,
          yelp_review_url: null,
          oil_price_per_quart: 5,
        },
      ],
      error: null,
    });

    const result = await fetchBookingProfile("acme");

    // ⚡ Security: stripe_account_id must never appear in the result
    expect(result).not.toHaveProperty("stripe_account_id");

    expect(result).toEqual({
      id: "",
      user_id: "owner-1",
      business_name: "Acme Auto",
      phone: "555-1234",
      email: "acme@example.com",
      address: null,
      logo_url: "https://cdn.example.com/logo.png",
      opening_time: "08:00",
      closing_time: "17:00",
      working_days: ["monday", "tuesday"],
      currency: "USD",
      service_radius_miles: 15,
      service_address: "123 Main St",
      service_coordinates: { lat: 30.1, lng: -97.7 },
      buffer_time_before: 0,
      buffer_time_after: 0,
      min_lead_time_hours: 2,
      max_advance_days: 30,
      slot_duration_minutes: 30,
      stripe_charges_enabled: false,
      oil_price_per_quart: 5,
    });
  });

  it("preserves a configured zero-dollar additional oil quart price", async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          user_id: "owner-1",
          business_name: "Acme Auto",
          oil_price_per_quart: 0,
        },
      ],
      error: null,
    });

    const result = await fetchBookingProfile("acme");

    expect(result?.oil_price_per_quart).toBe(0);
  });

});

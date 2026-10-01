import { computeAppointmentTotal } from "@/lib/appointmentTotal";

describe("appointmentTotal", () => {
  it("returns 0 when no subtotal is available", () => {
    expect(computeAppointmentTotal(null, null)).toBe(0);
    expect(computeAppointmentTotal(undefined, undefined)).toBe(0);
    expect(computeAppointmentTotal({}, null)).toBe(0);
  });

  it("falls back to estimated_cost when no line items are joined", () => {
    expect(computeAppointmentTotal({ estimated_cost: 100 }, null)).toBe(100);
  });

  it("prefers the line-item sum over a stale estimated_cost", () => {
    const total = computeAppointmentTotal(
      {
        estimated_cost: 999,
        appointment_services: [
          { price: 50, quantity: 2 },
          { price: 25, quantity: 1 },
        ],
      },
      null,
    );
    expect(total).toBe(125);
  });

  it("treats missing price/quantity as 0 and 1", () => {
    const total = computeAppointmentTotal(
      { appointment_services: [{ price: null }, { quantity: 3 }] },
      null,
    );
    // null price → 0; missing price → 0 × quantity 3 = 0 → subtotal 0 → total 0
    expect(total).toBe(0);
  });

  it("adds an explicit tax_amount on top of the subtotal", () => {
    const total = computeAppointmentTotal(
      { estimated_cost: 100, tax_amount: 8 },
      null,
    );
    expect(total).toBe(108);
  });

  it("falls back to the business tax_rate when no tax_amount was stamped", () => {
    const total = computeAppointmentTotal(
      { estimated_cost: 100 },
      { tax_rate: 8 },
    );
    expect(total).toBe(108);
  });

  it("applies fee settings (waste oil + shop fee) into the total", () => {
    const total = computeAppointmentTotal(
      { estimated_cost: 100 },
      { waste_oil_fee_enabled: true, waste_oil_fee: 5 },
    );
    expect(total).toBe(105);
  });
});

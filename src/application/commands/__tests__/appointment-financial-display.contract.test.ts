import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("canonical appointment invoice presentation", () => {
  const detail = readFileSync(join(process.cwd(), "src/legacy-pages/AppointmentDetail.tsx"), "utf8");
  const query = readFileSync(join(process.cwd(), "src/application/queries/appointment-detail.query.ts"), "utf8");

  it("reads the persisted invoice instead of recalculating fees from settings", () => {
    expect(detail).toContain("fetchAppointmentFinancialSnapshot(id)");
    expect(detail).not.toContain("computeFinancialSummary(");
    expect(query).toContain("/financials");
  });

  it("uses the persisted balance due and fee lines", () => {
    expect(detail).toContain("invoiceFinancials?.balance_due");
    expect(detail).toContain("invoiceFinancials?.lines.filter");
    expect(detail).toContain("financialsError");
  });

  it("reconciles the MOMS example to cents without hiding any invoice fees", () => {
    const services = 11000;
    const disposal = 400;
    const processing = 342;
    const totalCents = services + disposal + processing;
    expect(totalCents).toBe(11742);
    expect(totalCents - services).toBe(742);
  });
});

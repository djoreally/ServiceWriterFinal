import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("oil usage reporting-only contract", () => {
  const repoRoot = resolve(__dirname, "../../../");
  const completionMigration = readFileSync(
    resolve(repoRoot, "supabase/migrations/20260814090000_oil_usage_reporting_only.sql"),
    "utf8",
  );
  const completionCommand = readFileSync(
    resolve(repoRoot, "src/application/commands/service-record.command.ts"),
    "utf8",
  );
  const appointmentCommand = readFileSync(
    resolve(repoRoot, "src/application/commands/appointments.command.ts"),
    "utf8",
  );

  it("stores verified oil usage without inventory mutations in the completion RPC", () => {
    expect(completionMigration).toContain("p_oil_quarts_used");
    expect(completionMigration).toContain("oil_quarts_used");
    expect(completionMigration).not.toContain("UPDATE public.inventory_items");
    expect(completionMigration).not.toContain("UPDATE public.van_inventory");
    expect(completionMigration).not.toContain("p_oil_quarts_used::INTEGER");
  });

  it("does not consume reservations after canonical service completion", () => {
    const completionBody = completionCommand.slice(
      completionCommand.indexOf("export async function completeAppointmentWithServiceRecord"),
    );
    expect(completionBody).toContain("oilQuartsUsed");
    expect(completionBody).toContain("Completion must not mutate inventory");
    expect(completionBody).not.toContain("consumeAppointmentReservations");
  });

  it("does not consume reservations on alternate completed status updates", () => {
    const statusBody = appointmentCommand.slice(
      appointmentCommand.indexOf("export async function updateAppointmentStatus"),
    );
    const completedBranch = statusBody.slice(0, statusBody.indexOf("export async function rescheduleAppointment"));
    expect(completedBranch).not.toContain("consumeAppointmentReservations");
    expect(completedBranch).toContain("nextApi.appointments.complete");
  });
});

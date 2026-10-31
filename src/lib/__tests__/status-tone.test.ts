import { resolveStatusChip, statusToneClasses } from "@/lib/status-tone";

// Phase 1 / B1 (T-9): status chips consume the server's composed
// status_label + status_tone. The fallback is B1's own view of the raw
// status. The F-6 truthfulness rule rides along: an unrecognized status
// renders as itself and can NEVER be dressed up as a real status.

const REAL_LABELS = ["Pending", "Confirmed", "Completed", "Cancelled", "No-show", "In progress"];

describe("resolveStatusChip — server-composed fields win", () => {
  it("uses status_label + status_tone verbatim when the server composed them", () => {
    const chip = resolveStatusChip({ status: "in_progress", status_label: "In Progress", status_tone: "warning" });
    expect(chip).toEqual({ label: "In Progress", tone: "warning" });
  });

  it("passes a server label for a future status through untouched", () => {
    const chip = resolveStatusChip({ status: "quality_check", status_label: "Quality Check", status_tone: "info" });
    expect(chip).toEqual({ label: "Quality Check", tone: "info" });
  });
});

describe("resolveStatusChip — B1 view fallback (no composed fields)", () => {
  it("confirmed renders Confirmed with the info tone", () => {
    expect(resolveStatusChip({ status: "confirmed" })).toEqual({ label: "Confirmed", tone: "info" });
  });

  it("completed renders Completed with the success tone", () => {
    expect(resolveStatusChip({ status: "completed" })).toEqual({ label: "Completed", tone: "success" });
  });

  it("cancelled renders Cancelled with the danger tone", () => {
    expect(resolveStatusChip({ status: "cancelled" })).toEqual({ label: "Cancelled", tone: "danger" });
  });

  it("an in_progress job does NOT render as Confirmed (the live F-6 defect)", () => {
    const chip = resolveStatusChip({ status: "in_progress" });
    expect(chip.label).toBe("In progress");
    expect(chip.label).not.toBe("Confirmed");
    expect(chip.tone).toBe("warning");
  });

  it.each([
    ["some_future_status", "Some future status"],
    ["quality_hold", "Quality hold"],
  ])("unknown status %s renders as itself (humanized), never as a real status", (status, label) => {
    const chip = resolveStatusChip({ status });
    expect(chip.label).toBe(label);
    expect(chip.tone).toBe("neutral");
    expect(REAL_LABELS).not.toContain(chip.label);
  });

  it("legacy synonym on_the_way resolves to the canonical En route", () => {
    expect(resolveStatusChip({ status: "on_the_way" })).toEqual({ label: "En route", tone: "info" });
  });
});

describe("statusToneClasses — every tone resolves to token classes", () => {
  it.each(["neutral", "info", "success", "warning", "danger"] as const)("%s has chip, bar and dot classes", (tone) => {
    const classes = statusToneClasses(tone);
    expect(classes.chip.length).toBeGreaterThan(0);
    expect(classes.bar.length).toBeGreaterThan(0);
    expect(classes.dot.length).toBeGreaterThan(0);
  });

  it("an unknown tone falls back to neutral", () => {
    expect(statusToneClasses("bogus" as never)).toEqual(statusToneClasses("neutral"));
  });
});

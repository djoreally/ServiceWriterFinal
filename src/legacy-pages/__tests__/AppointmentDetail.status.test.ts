import { resolveStatusChip } from "@/lib/status-tone";

// Redesign map A1 / friction F-6, carried into Phase 1: the appointment
// detail page must never present an unrecognized status as a real one. It
// previously defaulted unknown statuses to "Confirmed", so a live
// in_progress job displayed as Confirmed.
//
// A1 pinned that behavior to a page-local resolver. B1 has since landed
// the canonical vocabulary (status_label + status_tone composed by the
// server), and Phase 1 retired the local map: the detail header now
// resolves through resolveStatusChip (@/lib/status-tone), which prefers
// the server's composed fields and falls back to B1's own view. These
// tests pin the same truthful claims against the new path.

const REAL_LABELS = ["Pending", "Confirmed", "Completed", "Cancelled", "No-show"];

describe("detail status chip — known statuses keep their own label and tone", () => {
  it("pending renders Pending with the warning tone", () => {
    expect(resolveStatusChip({ status: "pending" })).toEqual({ label: "Pending", tone: "warning" });
  });

  it("confirmed renders Confirmed with the info tone", () => {
    expect(resolveStatusChip({ status: "confirmed" })).toEqual({ label: "Confirmed", tone: "info" });
  });

  it("completed renders Completed with the success tone", () => {
    expect(resolveStatusChip({ status: "completed" })).toEqual({ label: "Completed", tone: "success" });
  });

  it("cancelled renders Cancelled with the danger tone", () => {
    expect(resolveStatusChip({ status: "cancelled" })).toEqual({ label: "Cancelled", tone: "danger" });
  });

  it("no_show renders No-show with the neutral tone", () => {
    expect(resolveStatusChip({ status: "no_show" })).toEqual({ label: "No-show", tone: "neutral" });
  });

  it("the server's composed label and tone win over the raw status", () => {
    expect(
      resolveStatusChip({ status: "in_progress", status_label: "In progress", status_tone: "warning" }),
    ).toEqual({ label: "In progress", tone: "warning" });
  });
});

describe("detail status chip — unknown statuses render as themselves", () => {
  it.each([
    ["arrived", "Arrived"],
    ["en_route", "En route"],
    ["some_future_status", "Some future status"],
  ])("%s renders as %s, never as a real status label", (status, label) => {
    const chip = resolveStatusChip({ status });
    expect(chip.label).toBe(label);
    if (status === "some_future_status") {
      expect(REAL_LABELS).not.toContain(chip.label);
      expect(chip.tone).toBe("neutral");
    }
  });

  it("an in_progress job does NOT render as Confirmed (the live F-6 defect)", () => {
    const chip = resolveStatusChip({ status: "in_progress" });
    expect(chip.label).toBe("In progress");
    expect(chip.label).not.toBe("Confirmed");
    expect(chip.tone).toBe("warning");
  });
});

import { resolveAppointmentStatusStyle } from "@/legacy-pages/AppointmentDetail";
import { statusBadgeClasses } from "@/lib/statusStyles";

// Redesign map A1 / friction F-6: the appointment detail page must never
// present an unrecognized status as a real one. It previously defaulted
// unknown statuses to "Confirmed", so a live in_progress job displayed as
// Confirmed. These tests pin the truthful behavior until B1 lands the
// canonical API-provided status labels.

const REAL_LABELS = ["Pending Approval", "Confirmed", "Completed", "Cancelled", "No Show"];

describe("resolveAppointmentStatusStyle — known statuses keep their own label and tone", () => {
  it("pending renders Pending Approval with the awaiting tone", () => {
    const style = resolveAppointmentStatusStyle("pending");
    expect(style.label).toBe("Pending Approval");
    expect(style.className).toBe(`${statusBadgeClasses.awaiting} animate-pulse`);
  });

  it("confirmed renders Confirmed with the scheduled tone", () => {
    const style = resolveAppointmentStatusStyle("confirmed");
    expect(style.label).toBe("Confirmed");
    expect(style.className).toBe(statusBadgeClasses.scheduled);
  });

  it("completed renders Completed with the completed tone", () => {
    const style = resolveAppointmentStatusStyle("completed");
    expect(style.label).toBe("Completed");
    expect(style.className).toBe(statusBadgeClasses.completed);
  });

  it("cancelled renders Cancelled with the critical tone", () => {
    const style = resolveAppointmentStatusStyle("cancelled");
    expect(style.label).toBe("Cancelled");
    expect(style.className).toBe(statusBadgeClasses.critical);
  });

  it("no_show renders No Show with the awaiting tone", () => {
    const style = resolveAppointmentStatusStyle("no_show");
    expect(style.label).toBe("No Show");
    expect(style.className).toBe(statusBadgeClasses.awaiting);
  });
});

describe("resolveAppointmentStatusStyle — unknown statuses render as themselves", () => {
  it.each(["in_progress", "arrived", "en_route", "on_the_way", "some_future_status"])(
    "%s renders its raw status as the label, never a real status label",
    (status) => {
      const style = resolveAppointmentStatusStyle(status);
      expect(style.label).toBe(status);
      expect(REAL_LABELS).not.toContain(style.label);
    },
  );

  it("an in_progress job does NOT render as Confirmed (the live F-6 defect)", () => {
    const style = resolveAppointmentStatusStyle("in_progress");
    expect(style.label).not.toBe("Confirmed");
    expect(style.className).not.toBe(statusBadgeClasses.scheduled);
  });

  it("unknown statuses use the neutral muted tone, not any status tone", () => {
    const style = resolveAppointmentStatusStyle("in_progress");
    expect(style.className).toBe("bg-muted text-muted-foreground");
    expect(Object.values(statusBadgeClasses)).not.toContain(style.className);
  });
});

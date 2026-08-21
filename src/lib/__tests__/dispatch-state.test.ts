/**
 * Unit tests for dispatch-state.ts — transition guards and status normalization.
 * These are pure functions; no mocking required.
 */
import {
  normalizeTechnicianStatus,
  normalizeDispatchStatus,
  deriveDispatchStatusFromAppointment,
  isClosedDispatchStatus,
  isClosedDispatchJob,
  getNextDispatchStatus,
  canTransitionDispatchStatus,
  normalizeOperationalTechnicianStatus,
  isValidLatLng,
  toLatLng,
  isFiniteCoordinate,
  type TechnicianOperationalStatus,
  type DispatchStatus,
} from "@/lib/dispatch-state";

// ---------------------------------------------------------------------------
// isFiniteCoordinate / isValidLatLng / toLatLng
// ---------------------------------------------------------------------------
describe("coordinate utilities", () => {
  describe("isFiniteCoordinate", () => {
    it("accepts finite numbers", () => {
      expect(isFiniteCoordinate(0)).toBe(true);
      expect(isFiniteCoordinate(90.5)).toBe(true);
      expect(isFiniteCoordinate(-180)).toBe(true);
    });

    it("rejects non-finite numbers", () => {
      expect(isFiniteCoordinate(NaN)).toBe(false);
      expect(isFiniteCoordinate(Infinity)).toBe(false);
      expect(isFiniteCoordinate(-Infinity)).toBe(false);
    });

    it("rejects non-numbers", () => {
      expect(isFiniteCoordinate("1.23")).toBe(false);
      expect(isFiniteCoordinate(null)).toBe(false);
      expect(isFiniteCoordinate(undefined)).toBe(false);
    });
  });

  describe("isValidLatLng", () => {
    it("returns true for valid coordinate pairs", () => {
      expect(isValidLatLng(37.7749, -122.4194)).toBe(true);
      expect(isValidLatLng(0, 0)).toBe(true);
    });

    it("returns false when either coordinate is invalid", () => {
      expect(isValidLatLng(NaN, -122)).toBe(false);
      expect(isValidLatLng(37, NaN)).toBe(false);
      expect(isValidLatLng(null, -122)).toBe(false);
    });
  });

  describe("toLatLng", () => {
    it("returns coordinate object for valid inputs", () => {
      expect(toLatLng(40.71, -74.01)).toEqual({ lat: 40.71, lng: -74.01 });
    });

    it("returns null for invalid inputs", () => {
      expect(toLatLng(NaN, -74)).toBeNull();
      expect(toLatLng(40, "bad" as any)).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// normalizeTechnicianStatus
// ---------------------------------------------------------------------------
describe("normalizeTechnicianStatus", () => {
  const validStatuses: TechnicianOperationalStatus[] = [
    "offline", "available", "busy", "en_route", "on_site", "on_job", "on_break", "unavailable",
  ];

  it.each(validStatuses)("passes through valid status: %s", (status) => {
    expect(normalizeTechnicianStatus(status)).toBe(status);
  });

  it("is case-insensitive", () => {
    expect(normalizeTechnicianStatus("AVAILABLE")).toBe("available");
    expect(normalizeTechnicianStatus("On_Break")).toBe("on_break");
  });

  it("trims whitespace", () => {
    expect(normalizeTechnicianStatus("  busy  ")).toBe("busy");
  });

  it("maps alias 'arrived' → 'on_site'", () => {
    expect(normalizeTechnicianStatus("arrived")).toBe("on_site");
  });

  it("maps alias 'in_progress' → 'on_job'", () => {
    expect(normalizeTechnicianStatus("in_progress")).toBe("on_job");
  });

  it("maps alias 'active' → 'available'", () => {
    expect(normalizeTechnicianStatus("active")).toBe("available");
  });

  it("falls back to 'offline' for unknown values", () => {
    expect(normalizeTechnicianStatus("unknown_status")).toBe("offline");
    expect(normalizeTechnicianStatus(null)).toBe("offline");
    expect(normalizeTechnicianStatus(undefined)).toBe("offline");
    expect(normalizeTechnicianStatus(42)).toBe("offline");
  });
});

// ---------------------------------------------------------------------------
// normalizeDispatchStatus
// ---------------------------------------------------------------------------
describe("normalizeDispatchStatus", () => {
  const validStatuses: DispatchStatus[] = [
    "assigned", "en_route", "arrived", "in_progress", "completed", "cancelled",
  ];

  it.each(validStatuses)("passes through valid status: %s", (status) => {
    expect(normalizeDispatchStatus(status)).toBe(status);
  });

  it("is case-insensitive", () => {
    expect(normalizeDispatchStatus("COMPLETED")).toBe("completed");
    expect(normalizeDispatchStatus("In_Progress")).toBe("in_progress");
  });

  it("trims whitespace", () => {
    expect(normalizeDispatchStatus("  en_route  ")).toBe("en_route");
  });

  it("maps alias 'on_site' → 'arrived'", () => {
    expect(normalizeDispatchStatus("on_site")).toBe("arrived");
  });

  it("maps alias 'started' → 'in_progress'", () => {
    expect(normalizeDispatchStatus("started")).toBe("in_progress");
  });

  it("falls back to 'assigned' for unknown values", () => {
    expect(normalizeDispatchStatus("mystery")).toBe("assigned");
    expect(normalizeDispatchStatus(null)).toBe("assigned");
    expect(normalizeDispatchStatus(undefined)).toBe("assigned");
  });
});

// ---------------------------------------------------------------------------
// getNextDispatchStatus
// ---------------------------------------------------------------------------
describe("getNextDispatchStatus", () => {
  it("returns the forward transition for each non-terminal status", () => {
    expect(getNextDispatchStatus("assigned")).toBe("en_route");
    expect(getNextDispatchStatus("en_route")).toBe("arrived");
    expect(getNextDispatchStatus("arrived")).toBe("in_progress");
    expect(getNextDispatchStatus("in_progress")).toBe("completed");
  });

  it("returns null for terminal statuses", () => {
    expect(getNextDispatchStatus("completed")).toBeNull();
    expect(getNextDispatchStatus("cancelled")).toBeNull();
  });

  it("normalizes input before checking", () => {
    expect(getNextDispatchStatus("on_site")).toBe("in_progress"); // on_site → arrived → in_progress
    expect(getNextDispatchStatus("ASSIGNED")).toBe("en_route");
  });
});

// ---------------------------------------------------------------------------
// canTransitionDispatchStatus
// ---------------------------------------------------------------------------
describe("canTransitionDispatchStatus", () => {
  it("allows each valid forward transition", () => {
    expect(canTransitionDispatchStatus("assigned", "en_route")).toBe(true);
    expect(canTransitionDispatchStatus("en_route", "arrived")).toBe(true);
    expect(canTransitionDispatchStatus("arrived", "in_progress")).toBe(true);
    expect(canTransitionDispatchStatus("in_progress", "completed")).toBe(true);
  });

  it("blocks skipping steps", () => {
    expect(canTransitionDispatchStatus("assigned", "arrived")).toBe(false);
    expect(canTransitionDispatchStatus("assigned", "in_progress")).toBe(false);
    expect(canTransitionDispatchStatus("assigned", "completed")).toBe(false);
    expect(canTransitionDispatchStatus("en_route", "in_progress")).toBe(false);
  });

  it("blocks backward transitions", () => {
    expect(canTransitionDispatchStatus("in_progress", "arrived")).toBe(false);
    expect(canTransitionDispatchStatus("arrived", "en_route")).toBe(false);
    expect(canTransitionDispatchStatus("completed", "in_progress")).toBe(false);
  });

  it("blocks any transition out of terminal statuses", () => {
    expect(canTransitionDispatchStatus("completed", "assigned")).toBe(false);
    expect(canTransitionDispatchStatus("cancelled", "assigned")).toBe(false);
    expect(canTransitionDispatchStatus("completed", "en_route")).toBe(false);
  });

  it("normalizes input values", () => {
    expect(canTransitionDispatchStatus("ASSIGNED", "en_route")).toBe(true);
    expect(canTransitionDispatchStatus("on_site", "in_progress")).toBe(true); // on_site → arrived → in_progress
  });
});

// ---------------------------------------------------------------------------
// isClosedDispatchStatus
// ---------------------------------------------------------------------------
describe("isClosedDispatchStatus", () => {
  it("returns true for terminal statuses", () => {
    expect(isClosedDispatchStatus("completed")).toBe(true);
    expect(isClosedDispatchStatus("cancelled")).toBe(true);
  });

  it("returns false for non-terminal statuses", () => {
    expect(isClosedDispatchStatus("assigned")).toBe(false);
    expect(isClosedDispatchStatus("en_route")).toBe(false);
    expect(isClosedDispatchStatus("arrived")).toBe(false);
    expect(isClosedDispatchStatus("in_progress")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isClosedDispatchJob
// ---------------------------------------------------------------------------
describe("isClosedDispatchJob", () => {
  it("returns true when job.status is completed", () => {
    expect(isClosedDispatchJob({ status: "completed" })).toBe(true);
  });

  it("returns true when job.status is cancelled", () => {
    expect(isClosedDispatchJob({ status: "cancelled" })).toBe(true);
  });

  it("returns true when dispatch_status is terminal (status is not)", () => {
    expect(isClosedDispatchJob({ status: "active", dispatch_status: "completed" })).toBe(true);
  });

  it("returns true when dispatchStatus (camelCase) is terminal", () => {
    expect(isClosedDispatchJob({ dispatchStatus: "cancelled" })).toBe(true);
  });

  it("returns false when neither appointment nor dispatch status is terminal", () => {
    expect(isClosedDispatchJob({ status: "pending", dispatch_status: "in_progress" })).toBe(false);
  });

  it("returns false for empty job", () => {
    expect(isClosedDispatchJob({})).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// deriveDispatchStatusFromAppointment
// ---------------------------------------------------------------------------
describe("deriveDispatchStatusFromAppointment", () => {
  it("returns 'completed' when appointment is completed", () => {
    expect(deriveDispatchStatusFromAppointment("completed", "in_progress")).toBe("completed");
  });

  it("returns 'cancelled' when appointment is cancelled", () => {
    expect(deriveDispatchStatusFromAppointment("cancelled", "en_route")).toBe("cancelled");
  });

  it("defers to dispatch status for all other appointment states", () => {
    expect(deriveDispatchStatusFromAppointment("pending", "arrived")).toBe("arrived");
    expect(deriveDispatchStatusFromAppointment("confirmed", "en_route")).toBe("en_route");
    expect(deriveDispatchStatusFromAppointment(null, "assigned")).toBe("assigned");
  });

  it("normalizes dispatch status when appointment is non-terminal", () => {
    expect(deriveDispatchStatusFromAppointment("pending", "on_site")).toBe("arrived"); // alias
    expect(deriveDispatchStatusFromAppointment("pending", "started")).toBe("in_progress"); // alias
  });
});

// ---------------------------------------------------------------------------
// normalizeOperationalTechnicianStatus
// ---------------------------------------------------------------------------
describe("normalizeOperationalTechnicianStatus", () => {
  it("returns 'offline' when shift is inactive and no active appointment", () => {
    expect(
      normalizeOperationalTechnicianStatus({
        technicianStatus: "available",
        shiftActive: false,
        hasCurrentAppointment: false,
      })
    ).toBe("offline");
  });

  it("returns 'on_job' for in_progress dispatch work regardless of tech status", () => {
    expect(
      normalizeOperationalTechnicianStatus({
        technicianStatus: "busy",
        shiftActive: true,
        hasCurrentAppointment: true,
        currentDispatchStatus: "in_progress",
      })
    ).toBe("on_job");
  });

  it("returns 'on_job' for arrived dispatch status", () => {
    expect(
      normalizeOperationalTechnicianStatus({
        technicianStatus: "available",
        shiftActive: true,
        hasCurrentAppointment: true,
        currentDispatchStatus: "arrived",
      })
    ).toBe("on_job");
  });

  it("returns 'on_break' when on break during en_route/assigned appointment", () => {
    expect(
      normalizeOperationalTechnicianStatus({
        technicianStatus: "on_break",
        shiftActive: true,
        hasCurrentAppointment: true,
        currentDispatchStatus: "en_route",
      })
    ).toBe("on_break");
  });

  it("returns 'busy' (not on_break) for en_route/assigned when not on break", () => {
    expect(
      normalizeOperationalTechnicianStatus({
        technicianStatus: "available",
        shiftActive: true,
        hasCurrentAppointment: true,
        currentDispatchStatus: "assigned",
      })
    ).toBe("busy");
  });

  it("returns 'available' when shift is active and tech was offline", () => {
    expect(
      normalizeOperationalTechnicianStatus({
        technicianStatus: "offline",
        shiftActive: true,
        hasCurrentAppointment: false,
      })
    ).toBe("available");
  });

  it("passes through status when shift active and no overriding conditions", () => {
    expect(
      normalizeOperationalTechnicianStatus({
        technicianStatus: "on_break",
        shiftActive: true,
        hasCurrentAppointment: false,
      })
    ).toBe("on_break");
  });
});

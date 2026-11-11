import {
  adoptId,
  asNumber,
  asString,
  changeSetFor,
  isLocalOnlyReference,
  isUuid,
  jobTransitionFor,
  parseWireDate,
  serverReportStatus,
  serverStepStatus,
} from "../tech-app-sync-push.query";

describe("id adoption", () => {
  it("adopts a client UUID verbatim (either case)", () => {
    const gen = () => "generated";
    expect(adoptId("3f6b8f2e-1234-4abc-9def-0123456789ab", gen)).toBe(
      "3f6b8f2e-1234-4abc-9def-0123456789ab",
    );
    expect(adoptId("3F6B8F2E-1234-4ABC-9DEF-0123456789AB", gen)).toBe(
      "3F6B8F2E-1234-4ABC-9DEF-0123456789AB",
    );
  });

  it("generates for legacy Watermelon ids and junk", () => {
    const gen = () => "generated";
    expect(adoptId("a1b2c3d4e5f6", gen)).toBe("generated");
    expect(adoptId(null, gen)).toBe("generated");
    expect(adoptId(42, gen)).toBe("generated");
    expect(isUuid("3f6b8f2e-1234-4abc-9def-0123456789ab")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
  });
});

describe("status vocabularies", () => {
  it("maps local step statuses onto the production union, round-tripping the pull map", () => {
    expect(serverStepStatus("pass")).toBe("pass");
    expect(serverStepStatus("fail")).toBe("fail");
    expect(serverStepStatus("warn")).toBe("warning");
    expect(serverStepStatus("na")).toBe("not_applicable");
    expect(serverStepStatus("unchecked")).toBe("not_checked");
    expect(serverStepStatus("bogus")).toBe("not_checked");
    expect(serverStepStatus(null)).toBe("not_checked");
  });

  it("maps report statuses", () => {
    expect(serverReportStatus("completed")).toBe("completed");
    expect(serverReportStatus("in_progress")).toBe("draft");
    expect(serverReportStatus(undefined)).toBe("draft");
  });

  it("maps job statuses to RPC transitions; assigned and unknown never move a job", () => {
    expect(jobTransitionFor("en_route")).toBe("en_route");
    expect(jobTransitionFor("in_progress")).toBe("started");
    expect(jobTransitionFor("completed")).toBe("completed");
    expect(jobTransitionFor("assigned")).toBeNull();
    expect(jobTransitionFor("cancelled")).toBeNull();
    expect(jobTransitionFor(null)).toBeNull();
  });
});

describe("wire values", () => {
  it("parses ISO strings and epoch-ms numbers, rejects the rest", () => {
    expect(parseWireDate("2026-11-11T13:00:00.000Z")).toBe("2026-11-11T13:00:00.000Z");
    expect(parseWireDate(1794435600000)).toBe(new Date(1794435600000).toISOString());
    expect(parseWireDate("not a date")).toBeNull();
    expect(parseWireDate(0)).toBeNull();
    expect(parseWireDate(null)).toBeNull();
  });

  it("reads strings and numbers defensively", () => {
    expect(asString("  x ")).toBe("x");
    expect(asString("")).toBeNull();
    expect(asString(7)).toBeNull();
    expect(asNumber(3.5)).toBe(3.5);
    expect(asNumber("12.25")).toBe(12.25);
    expect(asNumber("abc")).toBeNull();
    expect(asNumber(null)).toBeNull();
  });

  it("recognizes device-only media references", () => {
    expect(isLocalOnlyReference("local-file://inspection-media/a/b.jpg")).toBe(true);
    expect(isLocalOnlyReference("appt-1/media-1.jpg")).toBe(false);
    expect(isLocalOnlyReference(null)).toBe(false);
  });
});

describe("changeSetFor", () => {
  it("returns an empty set for missing or malformed tables", () => {
    expect(changeSetFor({}, "jobs")).toEqual({ created: [], updated: [], deleted: [] });
    expect(changeSetFor(null, "jobs")).toEqual({ created: [], updated: [], deleted: [] });
    expect(
      changeSetFor({ jobs: { created: "nope" } as never }, "jobs"),
    ).toEqual({ created: [], updated: [], deleted: [] });
  });

  it("keeps well-formed sets and filters deleted ids to strings", () => {
    const set = changeSetFor(
      { jobs: { created: [{ id: "1" }], updated: [], deleted: ["a", 5, "b"] as never } },
      "jobs",
    );
    expect(set.created).toHaveLength(1);
    expect(set.deleted).toEqual(["a", "b"]);
  });
});

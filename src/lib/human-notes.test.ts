import { cleanHumanNotes } from "./human-notes";

// Ty's standing rule: an appointment's Notes show ONLY what the customer
// entered — no system/push text, ever. These tests pin the display-side
// cleaning for stored records that predate the write-side fix.

const PROVENANCE =
  "Pushed from MOMS website booking 4cd582be-ddc7-42ac-8eae-ca3a53838a26. Source: website. Website payment status: due_at_appointment.";
const DESCRIPTION = "Full Synthetic Oil Change for 2015 Cadillac SRX — booked on the MOMS website.";
const DESCRIPTION_MULTI =
  "Full Synthetic Oil Change + Mobil 1 Oil Change for 2020 Jaguar F-PACE + 2025 Subaru Crosstrek — booked on the MOMS website.";

describe("cleanHumanNotes — system text never renders as a customer note", () => {
  it("drops the website-push provenance line (the entire stored notes of a pushed appointment)", () => {
    expect(cleanHumanNotes(PROVENANCE)).toBe("");
  });

  it("drops the provenance line and keeps the customer's own lines", () => {
    expect(cleanHumanNotes(`${PROVENANCE}\nGate code is 4242.`)).toBe("Gate code is 4242.");
  });

  it("drops the composed 'booked on the MOMS website' description line", () => {
    expect(cleanHumanNotes(DESCRIPTION)).toBe("");
    expect(cleanHumanNotes(DESCRIPTION_MULTI)).toBe("");
  });

  it("drops the description line when it sits inside a notes value, keeping human lines", () => {
    expect(cleanHumanNotes(`Please use the side driveway.\n${DESCRIPTION}`)).toBe(
      "Please use the side driveway.",
    );
  });

  it("keeps a human line that merely mentions booking on the website", () => {
    const human = "Customer said they booked on the website last time too.";
    expect(cleanHumanNotes(human)).toBe(human);
  });
});

describe("cleanHumanNotes — pre-existing cleaning behavior is unchanged", () => {
  it("returns empty for null, undefined, and blank input", () => {
    expect(cleanHumanNotes(null)).toBe("");
    expect(cleanHumanNotes(undefined)).toBe("");
    expect(cleanHumanNotes("")).toBe("");
    expect(cleanHumanNotes("   \n  ")).toBe("");
  });

  it("keeps plain customer lines verbatim, collapsing repeated blank lines", () => {
    expect(cleanHumanNotes("First line.\n\n\nSecond line.")).toBe("First line.\n\nSecond line.");
  });

  it("drops Vehicles:/Services:/Payment: summary lines, keeping human lines", () => {
    const stored = [
      "Vehicles: 2015 Cadillac SRX",
      "Services: Full Synthetic Oil Change",
      "Payment: due at appointment",
      "Knock twice, the bell is broken.",
    ].join("\n");
    expect(cleanHumanNotes(stored)).toBe("Knock twice, the bell is broken.");
  });

  it("suppresses the whole filter-match block and keeps surrounding human lines", () => {
    const stored = [
      "Leave the keys in the mailbox.",
      "Filter match (confidence 0.92):",
      "• Oil filter: NAPA Gold 7055",
      "2025 Subaru Crosstrek",
      "Call when you arrive.",
    ].join("\n");
    expect(cleanHumanNotes(stored)).toBe("Leave the keys in the mailbox.\nCall when you arrive.");
  });
});

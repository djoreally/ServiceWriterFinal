import { describe, expect, it } from "@jest/globals";

// Contract mirrors the database ordering: owned workspace is priority 0,
// linked staff workspaces are priority 1, and fallback is priority 2.
describe("workforce identity priority", () => {
  it("keeps an owner/admin workspace ahead of a technician membership", () => {
    const memberships = [{ role: "technician", priority: 1 }, { role: "admin", priority: 0 }];
    expect([...memberships].sort((a, b) => a.priority - b.priority)[0].role).toBe("admin");
  });
});

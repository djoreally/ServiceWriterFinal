import { technicianJobPath, technicianJobUrl } from "@/server/messaging/lifecycle-action-urls";

describe("technician lifecycle action URLs", () => {
  it("routes technician assignment CTAs into the technician app", () => {
    const jobId = "123e4567-e89b-12d3-a456-426614174000";

    expect(technicianJobPath(jobId)).toBe(`/tech-app/jobs/${jobId}`);
    expect(technicianJobUrl(jobId, "https://servicewriter.xyz/api/v1/dispatch/assign")).toBe(
      `https://servicewriter.xyz/tech-app/jobs/${jobId}`,
    );
  });

  it("never produces an office appointment route for technician lifecycle links", () => {
    const url = technicianJobUrl("job-123", "https://servicewriter.xyz/api/v1/dispatch/assign");

    expect(url).toContain("/tech-app/jobs/job-123");
    expect(url).not.toContain("/appointments/");
    expect(url).not.toContain("/dashboard");
  });
});

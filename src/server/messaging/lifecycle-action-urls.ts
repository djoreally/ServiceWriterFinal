export function technicianJobPath(jobId: string): string {
  return `/tech-app/jobs/${encodeURIComponent(jobId)}`;
}

export function technicianJobUrl(jobId: string, requestUrl: string): string {
  return new URL(technicianJobPath(jobId), requestUrl).toString();
}

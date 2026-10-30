export function technicianJobPath(jobId: string): string {
  return `/tech-app/jobs/${encodeURIComponent(jobId)}`;
}

export function technicianJobUrl(jobId: string, requestUrl: string): string {
  return new URL(technicianJobPath(jobId), requestUrl).toString();
}

/**
 * The customer-facing entry for one appointment. `/my-bookings` is the
 * long-standing customer link (it redirects to the customer dashboard);
 * the `appointment` query carries the context through that redirect, the
 * dashboard's sign-in bounce, and the post-login return so the customer
 * lands on this appointment instead of a generic home page.
 */
export function customerAppointmentPath(appointmentId: string): string {
  return `/my-bookings?appointment=${encodeURIComponent(appointmentId)}`;
}

export function customerAppointmentUrl(appointmentId: string, requestUrl: string): string {
  return new URL(customerAppointmentPath(appointmentId), requestUrl).toString();
}

/**
 * Add appointment context to an action URL when — and only when — it is the
 * platform-default customer link. Workspace-configured manage URLs and any
 * other destination are returned untouched.
 */
export function withAppointmentContext(actionUrl: string, appointmentId: string): string {
  let url: URL;
  try {
    url = new URL(actionUrl);
  } catch {
    return actionUrl;
  }
  if (url.pathname !== "/my-bookings" || url.searchParams.has("appointment")) return actionUrl;
  url.searchParams.set("appointment", appointmentId);
  return url.toString();
}

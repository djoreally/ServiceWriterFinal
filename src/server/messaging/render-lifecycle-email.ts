import {
  getLifecycleTemplate,
  interpolate,
  renderLifecycleEmail,
  type LifecycleVariables,
} from "@/server/messaging/lifecycle-templates";

const BOOKING_CONFIRMATION = "appointment_booking_sequence.booking_confirmation";
const JOB_ASSIGNED = "appointment_booking_sequence.new_job_assigned";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function value(variables: LifecycleVariables, key: string, fallback = "—"): string {
  const current = variables[key];
  return current === null || current === undefined || current === "" ? fallback : String(current);
}

function detailRow(label: string, content: string): string {
  return `<tr><td style="padding:8px 0;color:#64748b;font-size:13px;vertical-align:top;width:120px">${escapeHtml(label)}</td><td style="padding:8px 0;color:#0f172a;font-size:14px;font-weight:600;vertical-align:top">${escapeHtml(content)}</td></tr>`;
}

function visibleActionUrl(variables: LifecycleVariables): string | null {
  const current = variables["email.primary_action_url"];
  if (typeof current !== "string") return null;
  const trimmed = current.trim();
  return !trimmed || trimmed === "#" || trimmed.includes("{{") ? null : trimmed;
}

function stripRawTimezone(input: string, timezone: string): string {
  if (!timezone || timezone === "—") return input;
  return input.split(timezone).join("").replace(/\s{2,}/g, " ").replace(/\s+([,.;])/g, "$1").trim();
}

function parseEssentialInformation(input: string, timezone: string): Array<{ label: string; value: string }> {
  return stripRawTimezone(input, timezone)
    .split(/\s*\|\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf(":");
      if (separator <= 0) return { label: "Details", value: part };
      return { label: part.slice(0, separator).trim(), value: part.slice(separator + 1).trim() };
    });
}

function recipientGreeting(variables: LifecycleVariables): string {
  const role = value(variables, "email.recipient_role", "");
  if (role === "technician") {
    const technician = value(variables, "technician.name", "");
    const firstName = technician && technician !== "—" ? technician.split(/\s+/)[0] : "";
    return firstName ? `Hi ${firstName},` : "Hello,";
  }
  if (role === "customer") {
    const firstName = value(variables, "customer.first_name", "");
    return firstName && firstName !== "—" ? `Hello ${firstName},` : "Hello,";
  }
  return "Hello,";
}

function renderConciseLifecycle(rendered: ReturnType<typeof renderLifecycleEmail>, key: string, variables: LifecycleVariables) {
  const template = getLifecycleTemplate(key);
  const business = value(variables, "business.name", "Service Writer");
  const timezone = value(variables, "business.timezone", "");
  const headline = stripRawTimezone(interpolate(template.headline, variables), timezone);
  const preview = stripRawTimezone(interpolate(template.preview, variables), timezone);
  const details = parseEssentialInformation(interpolate(template.essentialInformation, variables), timezone);
  const greeting = recipientGreeting(variables);
  const actionUrl = visibleActionUrl(variables);
  const ctaLabel = template.ctaLabel || "View details";
  const detailText = details.map((item) => `${item.label}: ${item.value}`).join("\n");
  const body = `${greeting}\n\n${preview}${detailText ? `\n\n${detailText}` : ""}`;
  const text = `${business}\n${headline.toUpperCase()}\n\n${body}${actionUrl ? `\n\n${ctaLabel}: ${actionUrl}` : ""}\n\nSent by ${business} · Powered by Service Writer`;
  const rows = details.length ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0">${details.map((item) => detailRow(item.label, item.value)).join("")}</table>` : "";
  const button = actionUrl ? `<a href="${escapeHtml(actionUrl)}" style="display:inline-block;margin-top:24px;background:#2563eb;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:13px 18px;border-radius:8px">${escapeHtml(ctaLabel)}</a>` : "";
  const html = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;background:#f1f5f9;color:#0f172a;font-family:Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preview)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden"><tr><td style="padding:22px 28px;background:#0f172a;color:#fff"><div style="font-size:22px;font-weight:800">${escapeHtml(business)}</div><div style="margin-top:5px;font-size:13px;color:#cbd5e1">Powered by Service Writer</div></td></tr><tr><td style="padding:30px 28px"><h1 style="margin:0 0 10px;font-size:27px;line-height:1.2">${escapeHtml(headline)}</h1><p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6">${escapeHtml(greeting)} ${escapeHtml(preview)}</p>${rows}${button}</td></tr><tr><td style="padding:17px 28px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11px">Sent by ${escapeHtml(business)} · Powered by Service Writer</td></tr></table></td></tr></table></body></html>`;
  return { ...rendered, preview, body, text, html };
}

function renderTechnicianAssignment(rendered: ReturnType<typeof renderLifecycleEmail>, variables: LifecycleVariables) {
  const business = value(variables, "business.name", "Service Writer");
  const technician = value(variables, "technician.name", "there");
  const customer = value(variables, "customer.full_name", "Customer");
  const service = value(variables, "appointment.service", "Service appointment");
  const date = value(variables, "appointment.date");
  const time = value(variables, "appointment.time");
  const vehicle = value(variables, "vehicle.description", "Vehicle on appointment");
  const address = value(variables, "appointment.address", "See appointment for location");
  const actionUrl = visibleActionUrl(variables) ?? "#";
  const firstName = technician.split(/\s+/)[0] || "there";
  const subject = `New job assigned — ${customer} — ${date} ${time}`;
  const preview = `${customer} · ${vehicle} · ${service} · ${date} at ${time}`;
  const body = `Hi ${firstName},\n\nYou have a new job assigned.\n\nCustomer: ${customer}\nVehicle: ${vehicle}\nService: ${service}\nDate: ${date}\nTime: ${time}\nLocation: ${address}\n\nOpen the job before heading out to review the latest appointment details.`;
  const text = `${business}\nNEW JOB ASSIGNED\n\n${body}\n\nView assigned job: ${actionUrl}\n\nSent by ${business} · Powered by Service Writer`;
  const html = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;background:#f1f5f9;color:#0f172a;font-family:Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preview)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden"><tr><td style="padding:22px 28px;background:#0f172a;color:#fff"><div style="font-size:22px;font-weight:800">${escapeHtml(business)}</div><div style="margin-top:5px;font-size:13px;color:#cbd5e1">Technician dispatch</div></td></tr><tr><td style="padding:30px 28px"><div style="font-size:12px;font-weight:700;letter-spacing:.08em;color:#2563eb">NEW ASSIGNMENT</div><h1 style="margin:7px 0 8px;font-size:27px;line-height:1.2">New job assigned</h1><p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6">Hi ${escapeHtml(firstName)}, this job has been added to your schedule. Review it before heading out.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0">${detailRow("Customer", customer)}${detailRow("Vehicle", vehicle)}${detailRow("Service", service)}${detailRow("Date", date)}${detailRow("Time", time)}${detailRow("Location", address)}</table><a href="${escapeHtml(actionUrl)}" style="display:inline-block;margin-top:24px;background:#2563eb;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:13px 18px;border-radius:8px">View assigned job</a></td></tr><tr><td style="padding:17px 28px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11px">Sent by ${escapeHtml(business)} · Powered by Service Writer</td></tr></table></td></tr></table></body></html>`;
  return { ...rendered, subject, preview, body, text, html };
}

function renderBookingConfirmation(rendered: ReturnType<typeof renderLifecycleEmail>, variables: LifecycleVariables) {
  const business = value(variables, "business.name", "Service Writer");
  const firstName = value(variables, "customer.first_name", "there");
  const service = value(variables, "appointment.service", "Service appointment");
  const date = value(variables, "appointment.date");
  const time = value(variables, "appointment.time");
  const vehicle = value(variables, "vehicle.description");
  const address = value(variables, "appointment.address");
  const estimate = value(variables, "appointment.total");
  const payment = value(variables, "appointment.payment_method", "Pay at service");
  const confirmation = value(variables, "appointment.confirmation_code");
  const actionUrl = visibleActionUrl(variables) ?? "#";
  const subject = `Appointment confirmed — ${business} — ${date}`;
  const preview = `${date} at ${time} · ${vehicle} · Estimated total ${estimate}`;
  const body = `Hello ${firstName},\n\nYour appointment with ${business} is confirmed. Below is your appointment summary and estimated service total.\n\n${service}\n${date} at ${time}\n${vehicle}\nEstimated total: ${estimate}\nPayment: ${payment}\nConfirmation: ${confirmation}\n\nKeep this email for your records. The amount shown is an estimate until service is completed.`;
  const text = `${business}\nAPPOINTMENT CONFIRMATION\n\n${body}\n\nService location: ${address}\n\nManage appointment: ${actionUrl}\n\nQuestions? Reply to this email.\nPowered by Service Writer.`;
  const html = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;background:#f1f5f9;color:#0f172a;font-family:Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preview)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden"><tr><td style="padding:24px 28px;background:#0f172a;color:#fff"><div style="font-size:22px;font-weight:800">${escapeHtml(business)}</div><div style="margin-top:5px;font-size:13px;color:#cbd5e1">Service appointment confirmation</div></td></tr><tr><td style="padding:30px 28px"><div style="font-size:12px;font-weight:700;letter-spacing:.08em;color:#16a34a">CONFIRMED</div><h1 style="margin:7px 0 8px;font-size:27px;line-height:1.2">Your appointment is confirmed</h1><p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6">Hello ${escapeHtml(firstName)}, your appointment is on the schedule. Keep this confirmation for your records.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0">${detailRow("Date", `${date} at ${time}`)}${detailRow("Vehicle", vehicle)}${detailRow("Services", service)}${detailRow("Location", address)}${detailRow("Payment", payment)}${detailRow("Confirmation", confirmation)}</table><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px"><tr><td style="padding:18px"><div style="font-size:13px;color:#64748b">Estimated service total</div><div style="margin-top:4px;font-size:28px;font-weight:800">${escapeHtml(estimate)}</div><div style="margin-top:6px;font-size:12px;color:#64748b">Estimate only. Final invoice reflects services actually performed.</div></td></tr></table><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:13px 18px;border-radius:8px">View appointment</a><p style="margin:24px 0 0;color:#64748b;font-size:13px;line-height:1.6">Questions or changes? Reply to this email and ${escapeHtml(business)} can help.</p></td></tr><tr><td style="padding:17px 28px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11px">Sent by ${escapeHtml(business)} · Powered by Service Writer</td></tr></table></td></tr></table></body></html>`;
  return { ...rendered, subject, preview, body, text, html };
}

export function renderLifecycleEmailForDelivery(key: string, variables: LifecycleVariables) {
  // Always render through the canonical registry first. This preserves required-variable
  // validation before any delivery-specific presentation is applied.
  const rendered = renderLifecycleEmail(key, variables);
  if (key === JOB_ASSIGNED) return renderTechnicianAssignment(rendered, variables);
  if (key === BOOKING_CONFIRMATION) return renderBookingConfirmation(rendered, variables);

  // Marketing keeps the authored body because consent/preferences language is part of
  // that contract. Operational and transactional delivery is intentionally concise.
  if (rendered.purpose === "marketing") return rendered;
  return renderConciseLifecycle(rendered, key, variables);
}

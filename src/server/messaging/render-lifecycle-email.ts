import { renderLifecycleEmail, type LifecycleVariables } from "@/server/messaging/lifecycle-templates";

const BOOKING_CONFIRMATION = "appointment_booking_sequence.booking_confirmation";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function value(variables: LifecycleVariables, key: string, fallback = "—"): string {
  const current = variables[key];
  return current === null || current === undefined || current === "" ? fallback : String(current);
}

function detailRow(label: string, content: string): string {
  return `<tr><td style="padding:8px 0;color:#64748b;font-size:13px;vertical-align:top;width:110px">${escapeHtml(label)}</td><td style="padding:8px 0;color:#0f172a;font-size:14px;font-weight:600;vertical-align:top">${escapeHtml(content)}</td></tr>`;
}

export function renderLifecycleEmailForDelivery(key: string, variables: LifecycleVariables) {
  const rendered = renderLifecycleEmail(key, variables);
  if (key !== BOOKING_CONFIRMATION) return rendered;

  const business = value(variables, "business.name", "Service Writer");
  const firstName = value(variables, "customer.first_name", "there");
  const service = value(variables, "appointment.service", "Service appointment");
  const date = value(variables, "appointment.date");
  const time = value(variables, "appointment.time");
  const timezone = value(variables, "business.timezone", "");
  const vehicle = value(variables, "vehicle.description");
  const address = value(variables, "appointment.address");
  const estimate = value(variables, "appointment.total");
  const payment = value(variables, "appointment.payment_method", "Pay at service");
  const confirmation = value(variables, "appointment.confirmation_code");
  const actionUrl = value(variables, "email.primary_action_url", "#");
  const subject = `Appointment confirmed — ${business} — ${date}`;
  const preview = `${date} at ${time} · ${vehicle} · Estimated total ${estimate}`;
  const body = `Hello ${firstName},\n\nYour appointment with ${business} is confirmed. Below is your appointment summary and estimated service total.\n\n${service}\n${date} at ${time} ${timezone}\n${vehicle}\nEstimated total: ${estimate}\nPayment: ${payment}\nConfirmation: ${confirmation}\n\nKeep this email for your records. The amount shown is an estimate until service is completed.`;
  const text = `${business}\nAPPOINTMENT CONFIRMATION\n\n${body}\n\nService location: ${address}\n\nManage appointment: ${actionUrl}\n\nQuestions? Reply to this email.\nPowered by Service Writer.`;
  const html = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;background:#f1f5f9;color:#0f172a;font-family:Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preview)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden"><tr><td style="padding:24px 28px;background:#0f172a;color:#fff"><div style="font-size:22px;font-weight:800">${escapeHtml(business)}</div><div style="margin-top:5px;font-size:13px;color:#cbd5e1">Mobile service appointment confirmation</div></td></tr><tr><td style="padding:30px 28px"><div style="font-size:12px;font-weight:700;letter-spacing:.08em;color:#16a34a">CONFIRMED</div><h1 style="margin:7px 0 8px;font-size:27px;line-height:1.2">Your appointment is confirmed</h1><p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6">Hello ${escapeHtml(firstName)}, your appointment is on the schedule. Keep this confirmation for your records.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0">${detailRow("Date", `${date} at ${time}${timezone ? ` (${timezone})` : ""}`)}${detailRow("Vehicle", vehicle)}${detailRow("Services", service)}${detailRow("Location", address)}${detailRow("Payment", payment)}${detailRow("Confirmation", confirmation)}</table><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px"><tr><td style="padding:18px"><div style="font-size:13px;color:#64748b">Estimated service total</div><div style="margin-top:4px;font-size:28px;font-weight:800">${escapeHtml(estimate)}</div><div style="margin-top:6px;font-size:12px;color:#64748b">Estimate only. Final invoice reflects services actually performed.</div></td></tr></table><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:13px 18px;border-radius:8px">View appointment</a><p style="margin:24px 0 0;color:#64748b;font-size:13px;line-height:1.6">Questions or changes? Reply to this email and ${escapeHtml(business)} can help.</p></td></tr><tr><td style="padding:17px 28px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11px">Sent by ${escapeHtml(business)} · Powered by Service Writer</td></tr></table></td></tr></table></body></html>`;

  return { ...rendered, subject, preview, body, text, html };
}

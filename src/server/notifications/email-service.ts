import 'server-only';

import { generateQuotePortalToken } from '@/server/auth/portal-token';

export type InspectionItemSummary = {
  name: string;
  category?: string | null;
  status: 'good' | 'attention' | 'urgent' | 'not_applicable';
  notes?: string | null;
  recommendedPrice?: string | null;
};

export type InspectionQuoteEmailPayload = {
  workspaceId: string;
  quoteId: string;
  quoteTotal: string;
  quoteSubtotal: string;
  quoteTax: string;
  customerName: string;
  customerEmail: string;
  vehicleDescription: string;
  shopName: string;
  shopPhone?: string | null;
  shopEmail?: string | null;
  inspectionTemplateName: string;
  inspectorName?: string | null;
  inspectionDate: Date;
  items: InspectionItemSummary[];
  expiresAt?: Date | null;
  appBaseUrl?: string;
};

export type QuoteApprovalConfirmationEmailPayload = {
  quoteId: string;
  quoteTotal: string;
  customerName: string;
  customerEmail: string;
  vehicleDescription: string;
  shopName: string;
  shopPhone?: string | null;
  shopEmail?: string | null;
  decidedAt: Date;
  workOrderNumber?: string | null;
};

function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildInspectionEmailHtml(payload: InspectionQuoteEmailPayload, portalUrl: string): string {
  const goodCount = payload.items.filter((i) => i.status === 'good').length;
  const attentionCount = payload.items.filter((i) => i.status === 'attention').length;
  const urgentCount = payload.items.filter((i) => i.status === 'urgent').length;

  const urgentAndAttentionItems = payload.items.filter(
    (i) => i.status === 'urgent' || i.status === 'attention'
  );

  const itemsListHtml = urgentAndAttentionItems.length > 0
    ? urgentAndAttentionItems
        .map((item) => {
          const isUrgent = item.status === 'urgent';
          const badgeBg = isUrgent ? '#fee2e2' : '#fef3c7';
          const badgeColor = isUrgent ? '#b91c1c' : '#b45309';
          const badgeText = isUrgent ? 'URGENT SAFETY REPAIR' : 'RECOMMENDED';

          return `
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 14px 16px;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                <span style="background: ${badgeBg}; color: ${badgeColor}; font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 4px; text-transform: uppercase;">
                  ${badgeText}
                </span>
                <strong style="font-size: 14px; color: #0f172a;">${escapeHtml(item.name)}</strong>
              </div>
              ${
                item.notes
                  ? `<div style="font-size: 13px; color: #475569; margin-top: 4px; font-style: italic;">“${escapeHtml(item.notes)}”</div>`
                  : ''
              }
            </td>
            <td style="padding: 14px 16px; text-align: right; font-weight: 700; color: #0f172a; font-size: 14px; vertical-align: top;">
              ${item.recommendedPrice ? `$${Number(item.recommendedPrice).toFixed(2)}` : 'Included'}
            </td>
          </tr>
        `;
        })
        .join('')
    : `<tr><td colspan="2" style="padding: 16px; text-align: center; color: #059669; font-weight: 600;">All inspection items passed inspection standards!</td></tr>`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Digital Vehicle Inspection & Estimate</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; line-height: 1.5;">
  <div style="max-width: 620px; margin: 30px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%); padding: 32px 28px; color: #ffffff;">
      <div style="font-size: 11px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #a5b4fc; margin-bottom: 6px;">
        DIGITAL VEHICLE INSPECTION & ESTIMATE
      </div>
      <h1 style="margin: 0; font-size: 24px; font-weight: 800; color: #ffffff;">${escapeHtml(payload.shopName)}</h1>
      <p style="margin: 6px 0 0; font-size: 14px; color: #c7d2fe;">
        Prepared for ${escapeHtml(payload.customerName)} · ${escapeHtml(payload.vehicleDescription)}
      </p>
    </div>

    <!-- Main Content -->
    <div style="padding: 28px;">
      
      <!-- Inspection Scorecard HUD -->
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; text-align: center;">
        <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; padding: 12px 8px;">
          <div style="font-size: 22px; font-weight: 800; color: #059669;">${goodCount}</div>
          <div style="font-size: 11px; font-weight: 700; color: #047857; text-transform: uppercase;">Passed</div>
        </div>
        <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 12px 8px;">
          <div style="font-size: 22px; font-weight: 800; color: #d97706;">${attentionCount}</div>
          <div style="font-size: 11px; font-weight: 700; color: #b45309; text-transform: uppercase;">Recommended</div>
        </div>
        <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 12px 8px;">
          <div style="font-size: 22px; font-weight: 800; color: #dc2626;">${urgentCount}</div>
          <div style="font-size: 11px; font-weight: 700; color: #b91c1c; text-transform: uppercase;">Urgent Attention</div>
        </div>
      </div>

      <p style="font-size: 14px; color: #334155; margin-bottom: 20px;">
        Our technicians completed a thorough digital multi-point inspection of your vehicle. Below is the summary of items requiring your attention along with our itemized estimate.
      </p>

      <!-- Inspection Items Table -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden;">
        <thead>
          <tr style="background: #f1f5f9; text-align: left;">
            <th style="padding: 10px 16px; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #475569;">Inspection Finding</th>
            <th style="padding: 10px 16px; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #475569; text-align: right;">Estimated Price</th>
          </tr>
        </thead>
        <tbody>
          ${itemsListHtml}
        </tbody>
      </table>

      <!-- Total Summary Card -->
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin-bottom: 28px;">
        <div style="display: flex; justify-content: space-between; font-size: 13px; color: #64748b; margin-bottom: 4px;">
          <span>Subtotal:</span>
          <span>$${Number(payload.quoteSubtotal).toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 13px; color: #64748b; margin-bottom: 8px;">
          <span>Estimated Taxes & Fees:</span>
          <span>$${Number(payload.quoteTax).toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 18px; font-weight: 800; color: #0f172a; border-top: 1px solid #e2e8f0; padding-top: 8px;">
          <span>Total Estimate:</span>
          <span style="color: #4f46e5;">$${Number(payload.quoteTotal).toFixed(2)}</span>
        </div>
      </div>

      <!-- Action Button CTA -->
      <div style="text-align: center; margin-bottom: 28px;">
        <a href="${portalUrl}" style="display: inline-block; background: #4f46e5; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 700; padding: 16px 36px; border-radius: 10px; box-shadow: 0 4px 14px rgba(79, 70, 229, 0.4);">
          Review Full Inspection & Authorize Work →
        </a>
        <div style="font-size: 12px; color: #94a3b8; margin-top: 10px;">
          Secure cryptographic link · No password required
        </div>
      </div>

      <!-- Shop Footer -->
      <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; font-size: 12px; color: #64748b; text-align: center;">
        <p style="margin: 0;"><strong>${escapeHtml(payload.shopName)}</strong></p>
        <p style="margin: 4px 0 0;">
          ${payload.shopPhone ? `Phone: ${escapeHtml(payload.shopPhone)} · ` : ''}
          ${payload.shopEmail ? `Email: ${escapeHtml(payload.shopEmail)}` : ''}
        </p>
      </div>

    </div>
  </div>
</body>
</html>
  `;
}

export function buildApprovalConfirmationHtml(payload: QuoteApprovalConfirmationEmailPayload): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Service Authorization Confirmed</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; line-height: 1.5;">
  <div style="max-width: 600px; margin: 30px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
    <div style="background: #059669; padding: 28px; color: #ffffff; text-align: center;">
      <div style="font-size: 32px; margin-bottom: 8px;">✓</div>
      <h1 style="margin: 0; font-size: 22px; font-weight: 800;">Repairs Authorized & In Progress!</h1>
      <p style="margin: 6px 0 0; font-size: 14px; opacity: 0.9;">
        Quote #${payload.quoteId.slice(0, 8)} · ${payload.vehicleDescription}
      </p>
    </div>
    <div style="padding: 28px;">
      <p style="font-size: 15px; color: #334155;">
        Hi <strong>${escapeHtml(payload.customerName)}</strong>,
      </p>
      <p style="font-size: 14px; color: #475569;">
        Thank you for approving your service estimate for <strong>$${Number(payload.quoteTotal).toFixed(2)}</strong>. Our technicians have received your authorization and work has commenced on your vehicle.
      </p>
      <div style="background: #f1f5f9; border-radius: 10px; padding: 16px; margin: 20px 0;">
        <div style="font-size: 13px; color: #64748b;">Authorized On:</div>
        <div style="font-size: 14px; font-weight: 700; color: #0f172a;">${payload.decidedAt.toLocaleString('en-US')}</div>
        ${payload.workOrderNumber ? `<div style="font-size: 13px; color: #64748b; margin-top: 8px;">Work Order Reference:</div><div style="font-size: 14px; font-weight: 700; color: #0f172a;">#${escapeHtml(payload.workOrderNumber)}</div>` : ''}
      </div>
      <p style="font-size: 13px; color: #64748b; text-align: center;">
        We will notify you immediately once your vehicle is ready for pickup.
      </p>
      <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; font-size: 12px; color: #94a3b8; text-align: center;">
        <strong>${escapeHtml(payload.shopName)}</strong> · ${payload.shopPhone || ''}
      </div>
    </div>
  </div>
</body>
</html>
  `;
}

export async function sendInspectionQuoteEmail(payload: InspectionQuoteEmailPayload): Promise<{
  success: boolean;
  portalUrl: string;
  providerReference?: string;
  simulated?: boolean;
}> {
  const expiresAt = payload.expiresAt || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const token = generateQuotePortalToken(payload.workspaceId, payload.quoteId, expiresAt);
  const baseUrl = payload.appBaseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const portalUrl = `${baseUrl.replace(/\/$/, '')}/portal/quotes/${payload.quoteId}?token=${encodeURIComponent(token)}`;

  const html = buildInspectionEmailHtml(payload, portalUrl);
  const subject = `${payload.shopName}: Digital Inspection Report & Service Estimate for ${payload.vehicleDescription}`;

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || 'Service Writer <service@updates.servicewriter.app>';

  if (apiKey) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `inspection-email:${payload.quoteId}:${Date.now()}`,
        },
        body: JSON.stringify({
          from,
          to: [payload.customerEmail],
          subject,
          html,
          reply_to: payload.shopEmail ? sanitizeHeaderValue(payload.shopEmail) : undefined,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!response.ok) {
        console.warn('Resend API returned non-OK status:', data);
        return { success: false, portalUrl, providerReference: data.message };
      }
      return { success: true, portalUrl, providerReference: data.id || 'resend:sent' };
    } catch (err) {
      console.error('Failed to send email via Resend API:', err);
      return { success: false, portalUrl, providerReference: String(err) };
    }
  }

  // If no live API key is configured (local preview / testing environment), return successful simulated dispatch
  return {
    success: true,
    portalUrl,
    providerReference: `simulated:local:${payload.quoteId}`,
    simulated: true,
  };
}

export async function sendQuoteApprovedConfirmationEmail(payload: QuoteApprovalConfirmationEmailPayload): Promise<{
  success: boolean;
  providerReference?: string;
  simulated?: boolean;
}> {
  const html = buildApprovalConfirmationHtml(payload);
  const subject = `${payload.shopName}: Service Authorization Confirmed (#${payload.quoteId.slice(0, 8)})`;

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || 'Service Writer <service@updates.servicewriter.app>';

  if (apiKey) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `quote-approved-email:${payload.quoteId}:${Date.now()}`,
        },
        body: JSON.stringify({
          from,
          to: [payload.customerEmail],
          subject,
          html,
          reply_to: payload.shopEmail ? sanitizeHeaderValue(payload.shopEmail) : undefined,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
      return { success: response.ok, providerReference: data.id || 'resend:sent' };
    } catch (err) {
      console.error('Failed to send confirmation email via Resend:', err);
      return { success: false, providerReference: String(err) };
    }
  }

  return {
    success: true,
    providerReference: `simulated:approval:${payload.quoteId}`,
    simulated: true,
  };
}

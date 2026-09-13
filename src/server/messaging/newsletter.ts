import { createSupabaseAdminClient } from "@/lib/supabase";
import { sendLifecycleEmail } from "@/server/messaging/lifecycle-sender";
import { NEWSLETTER_ISSUES } from "@/server/newsletter/moms-content";

type EnrollInput = {
  workspaceId: string;
  ownerUserId: string;
  customerId?: string | null;
  email: string;
  bookingSlug: string;
  businessName: string;
};

type SubscriberRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  email: string;
  status: string;
  booking_slug: string | null;
  unsubscribe_token: string;
  welcome_sent_at: string | null;
  next_issue_number: number;
  next_send_at: string | null;
};

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://servicewriter.xyz").replace(/\/$/, "");

function normalizedEmail(email: string) {
  return email.trim().toLowerCase();
}

function bookingUrl(slug: string) {
  return `https://${slug}.servicewriter.xyz`;
}

function preferenceUrl(token: string) {
  return `${APP_URL}/api/v1/newsletter/preferences?token=${encodeURIComponent(token)}`;
}

async function ensureMomsSequence(workspaceId: string, ownerUserId: string) {
  const admin = createSupabaseAdminClient();
  const existing = await admin
    .from("newsletter_sequences")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("name", "MOMS 52-Week Newsletter")
    .maybeSingle();
  if (existing.error) throw existing.error;

  let sequenceId = existing.data?.id as string | undefined;
  if (!sequenceId) {
    const created = await admin.from("newsletter_sequences").insert({
      workspace_id: workspaceId,
      user_id: ownerUserId,
      name: "MOMS 52-Week Newsletter",
      description: "Welcome immediately, then one MOMS car-care email every 7 days for 52 weeks.",
      is_active: true,
      start_date: new Date().toISOString().slice(0, 10),
    }).select("id").single();
    if (created.error || !created.data?.id) throw created.error ?? new Error("Newsletter sequence could not be created");
    sequenceId = String(created.data.id);
  }

  const rows = NEWSLETTER_ISSUES.map((issue) => ({
    workspace_id: workspaceId,
    user_id: ownerUserId,
    sequence_id: sequenceId!,
    month_number: issue.week,
    subject: issue.subject,
    preview_text: issue.preheader,
    content: [issue.headline, issue.body, issue.ctaLabel ? `CTA: ${issue.ctaLabel}` : null, issue.ctaUrl ? `URL: ${issue.ctaUrl}` : null].filter(Boolean).join("\n\n"),
    holiday_theme: "",
    seasonal_theme: issue.category,
    is_active: true,
  }));
  const seeded = await admin.from("newsletter_templates").upsert(rows, { onConflict: "sequence_id,month_number" });
  if (seeded.error) throw seeded.error;
  return sequenceId;
}

export async function enrollNewsletterFromBooking(input: EnrollInput) {
  const admin = createSupabaseAdminClient();
  const email = normalizedEmail(input.email);
  const previous = await admin.from("newsletter_subscribers")
    .select("id,status,welcome_sent_at")
    .eq("workspace_id", input.workspaceId)
    .eq("email", email)
    .maybeSingle();
  if (previous.error) throw previous.error;

  if (input.bookingSlug === "momsoilchange") {
    await ensureMomsSequence(input.workspaceId, input.ownerUserId);
  }

  const now = new Date();
  const firstSend = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const upserted = await admin.from("newsletter_subscribers").upsert({
    workspace_id: input.workspaceId,
    user_id: input.ownerUserId,
    customer_id: input.customerId ?? null,
    email,
    status: "active",
    source: "public_booking",
    booking_slug: input.bookingSlug,
    consented_at: now.toISOString(),
    unsubscribed_at: null,
    next_issue_number: previous.data?.status === "active" ? undefined : 1,
    next_send_at: previous.data?.status === "active" ? undefined : firstSend,
  }, { onConflict: "workspace_id,email" }).select("*").single();
  if (upserted.error || !upserted.data) throw upserted.error ?? new Error("Newsletter subscriber could not be saved");

  const subscriber = upserted.data as SubscriberRow;
  const shouldWelcome = !previous.data?.welcome_sent_at || previous.data?.status !== "active";
  if (!shouldWelcome) return { subscriber, welcomeSent: false, alreadyActive: true };

  const result = await sendLifecycleEmail({
    workspaceId: input.workspaceId,
    recipientEmail: email,
    customerId: input.customerId ?? null,
    templateKey: "newsletter.welcome",
    idempotencyKey: `newsletter:welcome:${subscriber.id}:${now.toISOString().slice(0, 10)}`,
    variables: {
      "business.name": input.businessName,
      "email.recipient_name": "",
      "email.recipient_role": "customer",
      "email.primary_action_url": bookingUrl(input.bookingSlug),
      "email.preferences_url": preferenceUrl(subscriber.unsubscribe_token),
    },
    metadata: { newsletterSubscriberId: subscriber.id, bookingSlug: input.bookingSlug },
  });

  await admin.from("newsletter_subscribers").update({
    welcome_sent_at: result.status === "suppressed" ? null : new Date().toISOString(),
    welcome_message_id: result.providerMessageId ?? null,
    next_issue_number: 1,
    next_send_at: firstSend,
    updated_at: new Date().toISOString(),
  }).eq("id", subscriber.id);

  return { subscriber, welcomeSent: result.status !== "suppressed", alreadyActive: false };
}

export async function processDueNewsletterSubscribers(limit = 25) {
  const admin = createSupabaseAdminClient();
  const due = await admin.from("newsletter_subscribers")
    .select("id,workspace_id,user_id,email,status,booking_slug,unsubscribe_token,welcome_sent_at,next_issue_number,next_send_at")
    .eq("status", "active")
    .not("next_send_at", "is", null)
    .lte("next_send_at", new Date().toISOString())
    .order("next_send_at", { ascending: true })
    .limit(Math.max(1, Math.min(limit, 50)));
  if (due.error) throw due.error;

  const results = { claimed: due.data?.length ?? 0, sent: 0, failed: 0, completed: 0, suppressed: 0 };
  for (const row of (due.data ?? []) as SubscriberRow[]) {
    const issueNumber = Number(row.next_issue_number || 1);
    if (issueNumber > 52) {
      await admin.from("newsletter_subscribers").update({ next_send_at: null }).eq("id", row.id);
      results.completed += 1;
      continue;
    }

    try {
      const workspace = await admin.from("workspaces").select("name").eq("id", row.workspace_id).single();
      if (workspace.error || !workspace.data) throw workspace.error ?? new Error("Newsletter workspace missing");

      // A transient provider failure during booking must not skip the welcome.
      // The weekly worker retries it first, then starts Week 1 seven days later.
      if (!row.welcome_sent_at) {
        const welcome = await sendLifecycleEmail({
          workspaceId: row.workspace_id,
          recipientEmail: row.email,
          templateKey: "newsletter.welcome",
          idempotencyKey: `newsletter:welcome:${row.id}:retry`,
          variables: {
            "business.name": String(workspace.data.name),
            "email.recipient_name": "",
            "email.recipient_role": "customer",
            "email.primary_action_url": bookingUrl(row.booking_slug || "www"),
            "email.preferences_url": preferenceUrl(row.unsubscribe_token),
          },
          metadata: { newsletterSubscriberId: row.id, bookingSlug: row.booking_slug || "" },
        });

        if (welcome.status === "suppressed") {
          await admin.from("newsletter_subscribers").update({
            status: "unsubscribed",
            unsubscribed_at: new Date().toISOString(),
            next_send_at: null,
            updated_at: new Date().toISOString(),
          }).eq("id", row.id);
          results.suppressed += 1;
          continue;
        }

        await admin.from("newsletter_subscribers").update({
          welcome_sent_at: new Date().toISOString(),
          welcome_message_id: welcome.providerMessageId ?? null,
          next_issue_number: 1,
          next_send_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", row.id);
        continue;
      }

      let sequenceQuery = admin.from("newsletter_sequences").select("id")
        .eq("workspace_id", row.workspace_id).eq("is_active", true);
      if (row.booking_slug === "momsoilchange") {
        sequenceQuery = sequenceQuery.eq("name", "MOMS 52-Week Newsletter");
      }
      const sequence = await sequenceQuery.order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (sequence.error || !sequence.data?.id) throw sequence.error ?? new Error("No active newsletter sequence");

      const template = await admin.from("newsletter_templates")
        .select("id,subject,preview_text,content")
        .eq("workspace_id", row.workspace_id)
        .eq("sequence_id", sequence.data.id)
        .eq("month_number", issueNumber)
        .eq("is_active", true)
        .maybeSingle();
      if (template.error || !template.data) throw template.error ?? new Error(`Missing newsletter issue ${issueNumber}`);

      const contentParts = String(template.data.content || "").split(/\n\n+/);
      const headline = contentParts[0] || template.data.subject;
      const body = contentParts.slice(1).filter((part) => !part.startsWith("CTA:") && !part.startsWith("URL:")).join("\n\n") || headline;
      const ctaUrl = contentParts.find((part) => part.startsWith("URL:"))?.replace(/^URL:\s*/, "") || bookingUrl(row.booking_slug || "www");

      const sent = await sendLifecycleEmail({
        workspaceId: row.workspace_id,
        recipientEmail: row.email,
        templateKey: "newsletter.weekly",
        idempotencyKey: `newsletter:${row.id}:week:${issueNumber}`,
        variables: {
          "business.name": String(workspace.data.name),
          "email.recipient_name": "",
          "email.recipient_role": "customer",
          "email.primary_action_url": ctaUrl,
          "email.preferences_url": preferenceUrl(row.unsubscribe_token),
          "newsletter.subject": String(template.data.subject),
          "newsletter.preheader": String(template.data.preview_text || ""),
          "newsletter.headline": headline,
          "newsletter.body": body,
          "newsletter.week": issueNumber,
        },
        metadata: { newsletterSubscriberId: row.id, newsletterIssue: String(issueNumber) },
      });

      const status = sent.status === "suppressed" ? "suppressed" : sent.status;
      await admin.from("newsletter_deliveries").upsert({
        workspace_id: row.workspace_id,
        subscriber_id: row.id,
        template_id: template.data.id,
        issue_number: issueNumber,
        provider_message_id: sent.providerMessageId ?? null,
        status,
        sent_at: sent.status === "suppressed" ? null : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "subscriber_id,issue_number" });

      if (sent.status === "suppressed") {
        await admin.from("newsletter_subscribers").update({
          status: "unsubscribed",
          unsubscribed_at: new Date().toISOString(),
          next_send_at: null,
        }).eq("id", row.id);
        results.suppressed += 1;
        continue;
      }

      const nextIssue = issueNumber + 1;
      await admin.from("newsletter_subscribers").update({
        next_issue_number: nextIssue,
        next_send_at: nextIssue > 52 ? null : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", row.id);
      results.sent += 1;
      if (nextIssue > 52) results.completed += 1;
    } catch (error) {
      await admin.from("newsletter_deliveries").upsert({
        workspace_id: row.workspace_id,
        subscriber_id: row.id,
        issue_number: issueNumber,
        status: "failed",
        error_message: error instanceof Error ? error.message.slice(0, 500) : "Newsletter delivery failed",
        updated_at: new Date().toISOString(),
      }, { onConflict: "subscriber_id,issue_number" });
      results.failed += 1;
    }
  }
  return results;
}

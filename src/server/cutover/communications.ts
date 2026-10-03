import "server-only";

import { renderLifecycleEmailForDelivery } from "@/server/messaging/render-lifecycle-email";
import type { LifecycleVariables } from "@/server/messaging/lifecycle-templates";
import { serviceWriterApi } from "@/server/service-writer-api";

export async function sendCanonicalLifecycleEmail(request: Request, input: {
  workspaceId: string;
  customerId?: string | null;
  appointmentId?: string | null;
  recipientEmail: string;
  templateKey: string;
  eventId: string;
  variables: LifecycleVariables;
  metadata?: Record<string, unknown>;
}) {
  const rendered = renderLifecycleEmailForDelivery(input.templateKey, input.variables);
  const idempotencyKey = `lifecycle:${input.templateKey}:${input.eventId}:${input.recipientEmail.trim().toLowerCase()}`;
  const queued = await serviceWriterApi<{ id: string }>(request, `/api/v1/workspaces/${input.workspaceId}/communications`, {
    method: "POST",
    headers: { "idempotency-key": idempotencyKey },
    body: JSON.stringify({
      customerId: input.customerId ?? null,
      templateId: null,
      channel: "email",
      purpose: rendered.purpose === "marketing" ? "marketing" : "transactional",
      recipient: input.recipientEmail,
      subject: rendered.subject,
      body: rendered.text,
      variables: input.variables,
      appointmentId: input.appointmentId ?? null,
      maxAttempts: 3,
      metadata: { lifecycleEventId: input.eventId, templateKey: input.templateKey, renderedHtml: rendered.html, ...(input.metadata ?? {}) },
    }),
  });
  return serviceWriterApi(request, `/api/v1/workspaces/${input.workspaceId}/communications/${queued.id}/send`, {
    method: "POST",
    headers: { "idempotency-key": `${idempotencyKey}:send` },
  });
}

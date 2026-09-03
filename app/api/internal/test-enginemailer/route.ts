import { NextResponse } from "next/server";
import { EnginemailerEmailAdapter } from "@/server/messaging/enginemailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN = "1FehFEuQ1QfM7hZ9BwdniBbXz46SaKUo";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("token") !== TOKEN) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const adapter = new EnginemailerEmailAdapter();
  const result = await adapter.send({
    workspaceId: "250c258f-fad6-46e1-86de-3de41a7d4e1a",
    recipient: { email: "djoreally@gmail.com" },
    purpose: "transactional",
    templateKey: "release.enginemailer_probe",
    subject: "ServiceWriter Enginemailer test — release verification",
    body: "This is a controlled ServiceWriter release test sent directly through the Enginemailer adapter. If you received this, provider submission is working.",
    html: "<p>This is a controlled <strong>ServiceWriter release test</strong> sent directly through the Enginemailer adapter.</p><p>If you received this, provider submission is working.</p>",
    fromName: "Service Writer",
    idempotencyKey: `release-enginemailer-probe-${Date.now()}`,
    metadata: { source: "release_probe" },
  });

  return NextResponse.json({ ok: true, provider: result.providerName, status: result.status, providerMessageId: result.providerMessageId, acceptedAt: result.acceptedAt });
}

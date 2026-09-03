const branch = process.env.VERCEL_GIT_COMMIT_REF || "";
const env = process.env.VERCEL_ENV || "";
if (env !== "preview" || branch !== "release/final-readiness-20260902") {
  console.log("ENGINEMAILER_RELEASE_PROBE skipped");
  process.exit(0);
}

const apiKey = (process.env.ENGINEMAILER_TRANSACTIONAL_API_KEY || process.env.ENGINEMAILER_API_KEY || "").trim();
const senderEmail = (process.env.ENGINEMAILER_TRANSACTIONAL_FROM_EMAIL || process.env.ENGINEMAILER_FROM_EMAIL || "").trim();
if (!apiKey || !senderEmail) {
  console.error("ENGINEMAILER_RELEASE_PROBE missing_config");
  process.exit(1);
}

const response = await fetch("https://api.enginemailer.com/RESTAPI/V2/Submission/SendEmail", {
  method: "POST",
  headers: { Accept: "application/json", "Content-Type": "application/json", APIKey: apiKey },
  body: JSON.stringify({
    CampaignName: "release.enginemailer_probe",
    ToEmail: "djoreally@gmail.com",
    Subject: "ServiceWriter Enginemailer test — release verification",
    SenderEmail: senderEmail,
    SubmittedContent: "<p>This is a controlled <strong>ServiceWriter release test</strong> sent directly through Enginemailer from the Vercel preview environment.</p><p>If you received this, provider submission is working.</p>",
    SenderName: "Service Writer",
    SubstitutionTags: [],
  }),
});

const payload = await response.json().catch(() => ({}));
const statusCode = Number(payload?.Result?.StatusCode ?? response.status);
if (!response.ok || (Number.isFinite(statusCode) && statusCode >= 400)) {
  console.error("ENGINEMAILER_RELEASE_PROBE failed", response.status, payload?.Result?.ErrorMessage || payload?.message || "provider_error");
  process.exit(1);
}
const id = payload?.Result?.TransactionID ?? payload?.Result?.TransactionId ?? payload?.Result?.TxID ?? payload?.Result?.CampaignTxID ?? payload?.TransactionID ?? payload?.TransactionId ?? payload?.TxID ?? payload?.CampaignTxID ?? payload?.id ?? "accepted-untracked";
console.log(`ENGINEMAILER_RELEASE_PROBE accepted provider_message_id=${String(id)}`);

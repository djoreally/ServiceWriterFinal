import {
  LIFECYCLE_TEMPLATES,
  LIFECYCLE_TEMPLATE_COUNT,
  getLifecycleTemplate,
  renderLifecycleEmail,
} from "../src/server/messaging/lifecycle-templates";
import { NEWSLETTER_ISSUES } from "../src/server/newsletter/moms-content";

const failures: string[] = [];
const fail = (message: string) => failures.push(message);
const variablePattern = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

if (LIFECYCLE_TEMPLATE_COUNT !== 177) {
  fail(`Expected 177 lifecycle templates, found ${LIFECYCLE_TEMPLATE_COUNT}`);
}

for (const template of Object.values(LIFECYCLE_TEMPLATES)) {
  const effectiveTemplate = getLifecycleTemplate(template.key);
  const source = [
    template.subject,
    template.preview,
    template.headline,
    template.body,
    template.essentialInformation,
  ].join("\n");

  const required = new Set(
    [...source.matchAll(variablePattern)].map((match) => match[1]),
  );
  required.add("email.primary_action_url");
  if (effectiveTemplate.purpose === "marketing") required.add("email.preferences_url");

  const variables: Record<string, string> = {};
  for (const key of required) {
    if (key === "email.primary_action_url") variables[key] = "https://servicewriter.xyz/certification/action";
    else if (key === "email.preferences_url") variables[key] = "https://servicewriter.xyz/certification/preferences";
    else if (key.endsWith(".email")) variables[key] = "certification@example.com";
    else if (key.endsWith(".phone")) variables[key] = "215-555-0100";
    else variables[key] = "Certified value";
  }

  try {
    const rendered = renderLifecycleEmail(template.key, variables);
    const outputs = [rendered.subject, rendered.preview, rendered.body, rendered.text, rendered.html];
    if (outputs.some((value) => !value || !value.trim())) fail(`${template.key}: rendered output is empty`);
    if (outputs.some((value) => value.includes("{{"))) fail(`${template.key}: unresolved merge token remains`);
    if (!rendered.html.includes("<html")) fail(`${template.key}: HTML document missing`);
    if (!rendered.text.includes("http")) fail(`${template.key}: text fallback missing action/preferences URL`);
    if (rendered.purpose === "marketing") {
      if (!rendered.text.includes("Manage email preferences or unsubscribe")) fail(`${template.key}: marketing text missing preferences language`);
      if (!rendered.html.includes("Manage email preferences or unsubscribe")) fail(`${template.key}: marketing HTML missing preferences language`);
    }
  } catch (error) {
    fail(`${template.key}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (NEWSLETTER_ISSUES.length !== 52) fail(`Expected 52 newsletter issues, found ${NEWSLETTER_ISSUES.length}`);
const weeks = new Set<number>();
for (const issue of NEWSLETTER_ISSUES) {
  weeks.add(issue.week);
  if (!issue.subject.trim()) fail(`newsletter week ${issue.week}: subject missing`);
  if (!issue.preheader.trim()) fail(`newsletter week ${issue.week}: preheader missing`);
  if (!issue.headline.trim()) fail(`newsletter week ${issue.week}: headline missing`);
  if (!issue.body.trim()) fail(`newsletter week ${issue.week}: body missing`);
  if (issue.ctaUrl && !/^https:\/\//.test(issue.ctaUrl)) fail(`newsletter week ${issue.week}: CTA URL is not HTTPS`);
}
if (weeks.size !== 52 || Math.min(...weeks) !== 1 || Math.max(...weeks) !== 52) {
  fail("Newsletter issues must uniquely cover weeks 1 through 52");
}

if (failures.length) {
  console.error("Runtime email rendering certification FAILED:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  status: "PASS",
  lifecycleTemplatesRendered: LIFECYCLE_TEMPLATE_COUNT,
  newsletterIssuesValidated: NEWSLETTER_ISSUES.length,
  unresolvedMergeTokens: 0,
  htmlAndTextAlternatives: true,
  marketingPreferencesLinks: true,
}, null, 2));

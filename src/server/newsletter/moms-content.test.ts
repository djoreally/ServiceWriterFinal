import {
  NEWSLETTER_ISSUES,
  NewsletterCategory,
  NewsletterIssue,
  renderNewsletter,
} from "@/server/newsletter/moms-content";

const VALID_CATEGORIES: NewsletterCategory[] = [
  "education",
  "maintenance_tip",
  "psa",
  "recall",
  "seasonal",
  "offer",
  "fleet",
  "trust",
];

describe("NEWSLETTER_ISSUES catalog", () => {
  it("contains exactly 52 issues, one per week, in order", () => {
    expect(NEWSLETTER_ISSUES).toHaveLength(52);
    const weeks = NEWSLETTER_ISSUES.map((issue) => issue.week);
    expect(new Set(weeks).size).toBe(52);
    expect(weeks).toEqual(Array.from({ length: 52 }, (_, index) => index + 1));
  });

  it("gives every issue non-empty required fields and a valid category", () => {
    for (const issue of NEWSLETTER_ISSUES) {
      expect(typeof issue.subject).toBe("string");
      expect(issue.subject.trim().length).toBeGreaterThan(0);
      expect(issue.preheader.trim().length).toBeGreaterThan(0);
      expect(issue.headline.trim().length).toBeGreaterThan(0);
      expect(issue.body.trim().length).toBeGreaterThan(0);
      expect(VALID_CATEGORIES).toContain(issue.category);
    }
  });

  it("covers every newsletter category at least once", () => {
    const used = new Set(NEWSLETTER_ISSUES.map((issue) => issue.category));
    for (const category of VALID_CATEGORIES) {
      expect(used.has(category)).toBe(true);
    }
  });

  it("keeps CTA label and URL paired whenever a CTA is present", () => {
    for (const issue of NEWSLETTER_ISSUES) {
      if (issue.ctaLabel || issue.ctaUrl) {
        expect(issue.ctaLabel?.trim().length).toBeGreaterThan(0);
        expect(issue.ctaUrl?.trim().length).toBeGreaterThan(0);
        expect(() => new URL(issue.ctaUrl as string)).not.toThrow();
      }
    }
  });
});

describe("renderNewsletter", () => {
  const UNSUBSCRIBE_URL = "https://servicewriter.xyz/api/v1/newsletter/preferences?token=tok_123";

  it("renders a non-empty HTML document for every issue", () => {
    for (const issue of NEWSLETTER_ISSUES) {
      const html = renderNewsletter(issue, UNSUBSCRIBE_URL);
      expect(html.length).toBeGreaterThan(500);
      expect(html).toContain("<!doctype html>");
    }
  });

  it("interpolates the headline, body, week number, preheader, and unsubscribe URL for every issue", () => {
    for (const issue of NEWSLETTER_ISSUES) {
      const html = renderNewsletter(issue, UNSUBSCRIBE_URL);
      expect(html).toContain(issue.headline);
      expect(html).toContain(issue.body);
      expect(html).toContain(issue.preheader);
      expect(html).toContain(`Week ${issue.week}`);
      expect(html).toContain(UNSUBSCRIBE_URL);
      expect(html).toContain("Unsubscribe");
    }
  });

  it("renders a CTA button when the issue has one and omits it otherwise", () => {
    const withCta = NEWSLETTER_ISSUES.find((issue) => issue.ctaLabel && issue.ctaUrl) as NewsletterIssue;
    const renderedWithCta = renderNewsletter(withCta, UNSUBSCRIBE_URL);
    expect(renderedWithCta).toContain(withCta.ctaLabel as string);
    expect(renderedWithCta).toContain(`href="${withCta.ctaUrl}"`);

    const withoutCta = NEWSLETTER_ISSUES.find((issue) => !issue.ctaLabel && !issue.ctaUrl) as NewsletterIssue;
    expect(withoutCta).toBeDefined();
    const renderedWithoutCta = renderNewsletter(withoutCta, UNSUBSCRIBE_URL);
    expect(renderedWithoutCta).not.toContain("border-radius:999px");
    expect(renderedWithoutCta).toContain(UNSUBSCRIBE_URL);
  });

  it("handles each category without producing an empty render", () => {
    for (const category of VALID_CATEGORIES) {
      const issue = NEWSLETTER_ISSUES.find((candidate) => candidate.category === category) as NewsletterIssue;
      const html = renderNewsletter(issue, UNSUBSCRIBE_URL);
      expect(html).toContain(issue.headline);
      expect(html.trim().length).toBeGreaterThan(0);
    }
  });

  it("passes headline/body text through verbatim (no template mangling of special characters)", () => {
    const issue: NewsletterIssue = {
      week: 99,
      category: "psa",
      subject: "Test & check",
      preheader: "Preheader with <angle> & \"quotes\"",
      headline: "Oil & filters <matter> \"a lot\"",
      body: "Body with ampersand & and <html> tags and 'apostrophes'.",
      ctaLabel: "Click & go",
      ctaUrl: "https://example.com/?a=1&b=2",
    };
    const html = renderNewsletter(issue, UNSUBSCRIBE_URL);
    expect(html).toContain("Oil & filters <matter> \"a lot\"");
    expect(html).toContain("Body with ampersand & and <html> tags and 'apostrophes'.");
    expect(html).toContain("Preheader with <angle> & \"quotes\"");
    expect(html).toContain("Click & go");
  });
});

import { useCallback, useEffect, useState } from "react";
import { fetchBusinessLinks } from "@/application/queries/link-health.query";
import type { BusinessLinkData } from "@/application/queries/link-health.query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, Link2, Loader2, RefreshCw, ExternalLink } from "lucide-react";

interface LinkItem {
  label: string;
  url: string | null;
  issues: string[];
}

const BOOKING_DOMAIN = "servicewriter.xyz";

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function validateBookingSlug(slug: string | null): string[] {
  const issues: string[] = [];
  if (!slug) {
    issues.push("Booking link is not configured");
    return issues;
  }
  if (slug.length < 3) {
    issues.push("Booking slug must be at least 3 characters");
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    issues.push("Booking slug contains invalid characters (only lowercase letters, numbers, and hyphens are allowed)");
  }
  return issues;
}

function validateExternalUrl(
  value: string | null,
  label: string,
  expectedDomainHint?: string
): string[] {
  const issues: string[] = [];
  if (!value) {
    issues.push(`${label} is not configured`);
    return issues;
  }
  if (!isValidUrl(value)) {
    issues.push(`${label} is not a valid URL`);
    return issues;
  }
  if (expectedDomainHint) {
    try {
      const hostname = new URL(value).hostname.toLowerCase();
      if (!hostname.includes(expectedDomainHint)) {
        issues.push(`${label} does not look like a valid ${label} link`);
      }
    } catch {
      issues.push(`${label} is not a valid URL`);
    }
  }
  return issues;
}

function buildLinkItems(data: BusinessLinkData): LinkItem[] {
  return [
    {
      label: "Online Booking Link",
      url: data.booking_slug ? `https://${data.booking_slug}.${BOOKING_DOMAIN}` : null,
      issues: validateBookingSlug(data.booking_slug),
    },
    {
      label: "Google Review URL",
      url: data.google_review_url || null,
      issues: validateExternalUrl(data.google_review_url, "Google Review URL", "google"),
    },
    {
      label: "Yelp Review URL",
      url: data.yelp_review_url || null,
      issues: validateExternalUrl(data.yelp_review_url, "Yelp Review URL", "yelp"),
    },
    {
      label: "Business Website",
      url: data.website_url || null,
      issues: validateExternalUrl(data.website_url, "Business Website"),
    },
  ];
}

export const LinkHealthSection = () => {
  const [loading, setLoading] = useState(true);
  const [links, setLinks] = useState<LinkItem[]>([]);

  const loadLinks = useCallback(async () => {
    setLoading(true);
    const { data } = await fetchBusinessLinks();
    if (data) {
      setLinks(buildLinkItems(data));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  const issueLinks = links.filter((l) => l.issues.length > 0);
  const healthyLinks = links.filter((l) => l.issues.length === 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Link Health
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={loadLinks}
            disabled={loading}
            className="gap-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Review all configured business links and fix any issues
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            {issueLinks.length === 0 && (
              <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-green-50 px-4 py-3 text-sm text-gray-800">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                All links are configured and appear healthy.
              </div>
            )}

            {issueLinks.map((link) => (
              <div
                key={link.label}
                className="rounded-md border border-destructive/30 bg-destructive/5 p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                    <span className="font-medium text-sm">{link.label}</span>
                    <Badge variant="destructive" className="text-xs">
                      {link.issues.length} {link.issues.length === 1 ? "issue" : "issues"}
                    </Badge>
                  </div>
                  {link.url && (
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Open
                    </a>
                  )}
                </div>
                <ul className="mt-2 ml-6 space-y-1">
                  {link.issues.map((issue) => (
                    <li key={issue} className="text-xs text-destructive list-disc">
                      {issue}
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {healthyLinks.map((link) => (
              <div
                key={link.label}
                className="flex items-center justify-between rounded-md border border-gray-200 bg-green-50 px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-gray-600" />
                  <span className="text-sm font-medium text-green-900">{link.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  {link.url && (
                    <>
                      <span className="max-w-[200px] truncate text-xs text-gray-700">
                        {link.url}
                      </span>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-gray-700 hover:text-green-900"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

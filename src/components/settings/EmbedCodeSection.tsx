/**
 * EmbedCodeSection - Provides copy-paste embed snippets for external websites
 * Includes: Book Now button, Service Listing iframe, Booking Step 1 iframe, Subscription price table iframe
 */

import { useState } from "react";
import { Code, Copy, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

const TENANT_BASE_DOMAIN = "servicewriter.xyz";

interface EmbedCodeSectionProps {
  currentSlug: string;
}

/** Build full subdomain booking URL */
function getSubdomainUrl(slug: string): string {
  return `https://${slug}.${TENANT_BASE_DOMAIN}`;
}

/** Copy text to clipboard with user feedback */
function copyToClipboard(text: string, label: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`);
  } else {
    toast.error("Copy not available in this environment");
  }
}

function CodeBlock({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    copyToClipboard(code, label);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative">
      <pre className="bg-muted rounded-lg p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all border">
        {code}
      </pre>
      <Button
        variant="outline"
        size="sm"
        className="absolute top-2 right-2 gap-1.5"
        onClick={handleCopy}
      >
        {copied ? (
          <>
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
            Copied
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5" />
            Copy
          </>
        )}
      </Button>
    </div>
  );
}

export function EmbedCodeSection({ currentSlug }: EmbedCodeSectionProps) {
  if (!currentSlug) return null;

  const baseUrl = getSubdomainUrl(currentSlug);

  const bookNowButtonCode = `<!-- Book Now Button -->
<a href="${baseUrl}" target="_blank" rel="noopener noreferrer"
   style="display:inline-block;padding:12px 28px;background:#2563eb;color:#fff;font-family:sans-serif;font-size:16px;font-weight:600;border-radius:8px;text-decoration:none;transition:background .2s">
  Book Now
</a>`;

  const serviceListingCode = `<!-- Service Listing Embed -->
<iframe src="${baseUrl}/embed/services"
  width="100%" height="600" frameborder="0"
  style="border:none;border-radius:8px;max-width:800px"
  title="Our Services"
  loading="lazy">
</iframe>`;

  const bookingStepCode = `<!-- Booking Widget Embed -->
<iframe src="${baseUrl}/embed/booking"
  width="100%" height="700" frameborder="0"
  style="border:none;border-radius:8px;max-width:600px"
  title="Book an Appointment"
  loading="lazy">
</iframe>`;

  const subscriptionPriceTableCode = `<!-- Subscription Price Table Embed -->
<iframe src="${baseUrl}/embed/subscribe"
  width="100%" height="760" frameborder="0"
  style="border:none;border-radius:8px;max-width:1100px"
  title="Subscription Plans"
  loading="lazy">
</iframe>`;

  const voiceAgentCode = `<!-- Voice Booking Agent -->
<iframe src="https://servicewriter.xyz/voice-agent/${currentSlug}"
  width="400" height="500" frameborder="0"
  allow="microphone"
  style="border:none;border-radius:16px;max-width:420px"
  title="Voice Booking Agent"
  loading="lazy">
</iframe>`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Code className="h-5 w-5" />
          Embed Codes
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Add booking widgets to your existing website
        </p>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="button" className="w-full">
          <TabsList className="w-full grid grid-cols-5">
            <TabsTrigger value="button">Book Now</TabsTrigger>
            <TabsTrigger value="services">Services</TabsTrigger>
            <TabsTrigger value="booking">Widget</TabsTrigger>
            <TabsTrigger value="subscriptions">Plans</TabsTrigger>
            <TabsTrigger value="voice">Voice Agent</TabsTrigger>
          </TabsList>

          <TabsContent value="button" className="space-y-3 mt-4">
            <p className="text-sm text-muted-foreground">
              A styled button that links directly to your booking page. Paste this HTML anywhere on your website.
            </p>
            <CodeBlock code={bookNowButtonCode} label="Book Now button code" />
          </TabsContent>

          <TabsContent value="services" className="space-y-3 mt-4">
            <p className="text-sm text-muted-foreground">
              Embed your full service catalog so visitors can browse services before booking.
            </p>
            <CodeBlock code={serviceListingCode} label="Service listing embed code" />
          </TabsContent>

          <TabsContent value="booking" className="space-y-3 mt-4">
            <p className="text-sm text-muted-foreground">
              Embed the full booking flow directly on your site.
            </p>
            <CodeBlock code={bookingStepCode} label="Booking widget embed code" />
          </TabsContent>

          <TabsContent value="subscriptions" className="space-y-3 mt-4">
            <p className="text-sm text-muted-foreground">
              Embed a subscription price table so customers can compare and purchase maintenance plans from your website.
            </p>
            <CodeBlock code={subscriptionPriceTableCode} label="Subscription price table embed code" />
          </TabsContent>

          <TabsContent value="voice" className="space-y-3 mt-4">
            <p className="text-sm text-muted-foreground">
              Embed a voice-powered booking agent. Customers can book by speaking naturally. Requires microphone access.
            </p>
            <CodeBlock code={voiceAgentCode} label="Voice agent embed code" />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

/**
 * BookingLinkSection - Online booking link configuration
 * Subdomain-based: {slug}.servicewriter.xyz
 */

import { useState } from "react";
import { Link, Copy, ExternalLink, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { EmbedCodeSection } from "./EmbedCodeSection";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkBookingSlugAvailability } from "@/application/queries/booking-link.query";
import { toast } from "@/components/ui/sonner";

// Tenant subdomain base domain
const TENANT_BASE_DOMAIN = "servicewriter.xyz";

interface BookingLinkSectionProps {
  slugInput: string;
  setSlugInput: (slug: string) => void;
  currentSlug: string;
  slugAvailable: boolean | null;
  setSlugAvailable: (available: boolean | null) => void;
  onSave: () => Promise<void>;
  saving: boolean;
  businessName: string;
}

/**
 * Generate the full subdomain URL for a booking slug
 */
function getSubdomainUrl(slug: string): string {
  return `https://${slug}.${TENANT_BASE_DOMAIN}`;
}

export function BookingLinkSection({
  slugInput,
  setSlugInput,
  currentSlug,
  slugAvailable,
  setSlugAvailable,
  onSave,
  saving,
  businessName,
}: BookingLinkSectionProps) {
  const [checkingSlug, setCheckingSlug] = useState(false);

  const handleSlugChange = (value: string) => {
    const sanitized = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setSlugInput(sanitized);
    setSlugAvailable(null);
  };

  const checkSlugAvailability = async (slug: string) => {
    if (!slug || slug.length < 3) {
      setSlugAvailable(null);
      return;
    }

    const validSlug = /^[a-z0-9-]+$/.test(slug);
    if (!validSlug) {
      setSlugAvailable(false);
      return;
    }

    setCheckingSlug(true);
    
    const { available, error } = await checkBookingSlugAvailability(slug);

    if (error) {
      setSlugAvailable(null);
      setCheckingSlug(false);
      return;
    }

    setSlugAvailable(available);
    setCheckingSlug(false);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link className="h-5 w-5" />
            Online Booking Link
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Create your custom subdomain for customers to book online
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="booking_slug">Your Subdomain</Label>
            <div className="flex items-center gap-2">
              <Input
                id="booking_slug"
                value={slugInput}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="your-shop-name"
                className="flex-1 font-mono"
              />
              <div className="flex items-center bg-muted rounded-lg px-3 py-2 text-sm text-muted-foreground whitespace-nowrap">
                .{TENANT_BASE_DOMAIN}
              </div>
              <Button
                variant="outline"
                onClick={() => checkSlugAvailability(slugInput)}
                disabled={checkingSlug || !slugInput || slugInput.length < 3}
              >
                {checkingSlug ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Check"
                )}
              </Button>
            </div>
            
            {/* Availability status */}
            {slugInput && slugInput.length >= 3 && slugAvailable !== null && (
              <div className="space-y-3">
                <div className={`flex items-center gap-2 text-sm ${slugAvailable ? 'text-gray-600' : 'text-destructive'}`}>
                  {slugAvailable ? (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      <span>This booking link is available!</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4" />
                      <span>This link is taken or invalid. Use only lowercase letters, numbers, and hyphens.</span>
                    </>
                  )}
                </div>
                
                {slugAvailable && slugInput !== currentSlug && (
                  <Button
                    onClick={onSave}
                    disabled={saving}
                    className="gap-2"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    Confirm & Activate Link
                  </Button>
                )}
              </div>
            )}
            
            {slugInput && slugInput.length < 3 && (
              <p className="text-xs text-muted-foreground">
                Must be at least 3 characters. Use lowercase letters, numbers, and hyphens only.
              </p>
            )}
          </div>

          {/* Show active link if exists */}
          {currentSlug && (
            <div className="pt-4 border-t border-border space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                <Label className="text-base font-semibold">Your Subdomain is Live!</Label>
              </div>
              
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="flex-1 min-w-0 bg-background px-3 py-2 rounded-md text-sm font-mono truncate border">
                    {getSubdomainUrl(currentSlug)}
                  </code>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    className="gap-2"
                    onClick={() => {
                      if (typeof navigator !== 'undefined' && navigator.clipboard) {
                        navigator.clipboard.writeText(getSubdomainUrl(currentSlug));
                        toast.success("Booking link copied to clipboard!");
                      } else {
                        toast.error("Copy not available in this environment");
                      }
                    }}
                  >
                    <Copy className="h-4 w-4" />
                    Copy Link
                  </Button>
                  
                  {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={async () => {
                        try {
                          await navigator.share({
                            title: `Book with ${businessName || 'us'}`,
                            text: `Book your appointment online!`,
                            url: getSubdomainUrl(currentSlug),
                          });
                        } catch {
                          // User cancelled or share failed silently
                        }
                      }}
                    >
                      <ExternalLink className="h-4 w-4" />
                      Share
                    </Button>
                  )}
                  
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        window.open(getSubdomainUrl(currentSlug), '_blank');
                      }
                    }}
                  >
                    <ExternalLink className="h-4 w-4" />
                    Preview
                  </Button>
                </div>
              </div>
              
              <p className="text-xs text-muted-foreground">
                Share this subdomain with customers. Make sure you have active services in your Service Catalog.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Embed code snippets — only shown when a slug is active */}
      <EmbedCodeSection currentSlug={currentSlug} />
    </div>
  );
}

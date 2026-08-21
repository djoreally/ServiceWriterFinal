import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Save, ExternalLink } from "lucide-react";
import type { MarketplaceListing } from "@/application/queries/marketplace-provider.query";
import type { MarketplaceListingUpdate } from "@/application/commands/marketplace-provider.command";

interface Props {
  listing: MarketplaceListing;
  saving: boolean;
  onSave: (updates: MarketplaceListingUpdate) => Promise<void>;
}

export function MarketplaceSettings({ listing, saving, onSave }: Props) {
  const [slug, setSlug] = useState(listing.booking_slug ?? "");

  const normalizedSlug = slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Listing visibility</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium text-foreground">Show my business on the marketplace</p>
              <p className="text-sm text-muted-foreground">
                When off, your listing is removed from the public directory immediately.
              </p>
            </div>
            <Switch
              checked={listing.marketplace_opt_in}
              disabled={saving}
              onCheckedChange={(v) => onSave({ marketplace_opt_in: v })}
              aria-label="Show my business on the marketplace"
            />
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">0 bps platform fee</Badge>
            <span className="text-sm text-muted-foreground">
              Marketplace bookings carry no Service Writer platform fee.
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Public booking link</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:max-w-md">
            <Label htmlFor="mp-slug">Booking slug</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">/book/</span>
              <Input id="mp-slug" value={slug} onChange={(e) => setSlug(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">Saved as: /book/{normalizedSlug || "—"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={saving || !normalizedSlug}
              onClick={() => onSave({ booking_slug: normalizedSlug })}
            >
              <Save className="mr-2 h-4 w-4" /> {saving ? "Saving…" : "Save link"}
            </Button>
            {listing.booking_slug && (
              <>
                <Button variant="outline" asChild>
                  <a href={`/book/${listing.booking_slug}`} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" /> Booking page
                  </a>
                </Button>
                <Button variant="outline" asChild>
                  <a href={`/find-provider/${listing.booking_slug}`} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" /> Marketplace profile
                  </a>
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

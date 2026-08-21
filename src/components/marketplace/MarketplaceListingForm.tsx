import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";
import type { MarketplaceListing } from "@/application/queries/marketplace-provider.query";
import type { MarketplaceListingUpdate } from "@/application/commands/marketplace-provider.command";

interface Props {
  listing: MarketplaceListing;
  saving: boolean;
  onSave: (updates: MarketplaceListingUpdate) => Promise<void>;
}

export function MarketplaceListingForm({ listing, saving, onSave }: Props) {
  const [form, setForm] = useState({
    business_name: listing.business_name ?? "",
    marketplace_description: listing.marketplace_description ?? "",
    phone: listing.phone ?? "",
    website_url: listing.website_url ?? "",
    logo_url: listing.logo_url ?? "",
    cover_image_url: listing.cover_image_url ?? "",
    service_address: listing.service_address ?? "",
    city: listing.city ?? "",
    state: listing.state ?? "",
    postal_code: listing.postal_code ?? "",
  });

  const set = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Business information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="mp-name">Business name</Label>
            <Input id="mp-name" value={form.business_name} onChange={(e) => set({ business_name: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="mp-desc">Public description</Label>
            <Textarea
              id="mp-desc"
              rows={4}
              placeholder="Mobile oil changes delivered to your home or workplace."
              value={form.marketplace_description}
              onChange={(e) => set({ marketplace_description: e.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="mp-phone">Phone</Label>
              <Input id="mp-phone" value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mp-site">Website</Label>
              <Input
                id="mp-site"
                placeholder="https://"
                value={form.website_url}
                onChange={(e) => set({ website_url: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="mp-logo">Logo URL</Label>
              <Input id="mp-logo" value={form.logo_url} onChange={(e) => set({ logo_url: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mp-cover">Cover photo URL</Label>
              <Input
                id="mp-cover"
                value={form.cover_image_url}
                onChange={(e) => set({ cover_image_url: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Primary location</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="mp-addr">Street address</Label>
            <Input
              id="mp-addr"
              value={form.service_address}
              onChange={(e) => set({ service_address: e.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="mp-city">City</Label>
              <Input id="mp-city" value={form.city} onChange={(e) => set({ city: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mp-state">State</Label>
              <Input id="mp-state" value={form.state} onChange={(e) => set({ state: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mp-zip">ZIP</Label>
              <Input id="mp-zip" value={form.postal_code} onChange={(e) => set({ postal_code: e.target.value })} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Button disabled={saving} onClick={() => onSave(form)}>
        <Save className="mr-2 h-4 w-4" /> {saving ? "Saving…" : "Save listing"}
      </Button>
    </div>
  );
}

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Save, X } from "lucide-react";
import type { MarketplaceListing } from "@/application/queries/marketplace-provider.query";
import type { MarketplaceListingUpdate } from "@/application/commands/marketplace-provider.command";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface Props {
  listing: MarketplaceListing;
  saving: boolean;
  onSave: (updates: MarketplaceListingUpdate) => Promise<void>;
}

export function MarketplaceAvailability({ listing, saving, onSave }: Props) {
  const [form, setForm] = useState({
    service_radius_miles: listing.service_radius_miles ?? 25,
    marketplace_service_area_zips: listing.marketplace_service_area_zips ?? [],
    marketplace_accept_new_customers: listing.marketplace_accept_new_customers,
    marketplace_allow_same_day: listing.marketplace_allow_same_day,
    marketplace_auto_accept: listing.marketplace_auto_accept,
    marketplace_max_jobs_per_day: listing.marketplace_max_jobs_per_day ?? null,
    require_approval: listing.require_approval,
    min_lead_time_hours: listing.min_lead_time_hours ?? 2,
    max_advance_days: listing.max_advance_days ?? 30,
    working_days: listing.working_days ?? [],
  });
  const [zipDraft, setZipDraft] = useState("");

  const set = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }));

  const addZip = () => {
    const zip = zipDraft.trim();
    if (!/^\d{5}$/.test(zip) || form.marketplace_service_area_zips.includes(zip)) return;
    set({ marketplace_service_area_zips: [...form.marketplace_service_area_zips, zip] });
    setZipDraft("");
  };

  const toggleDay = (day: string, checked: boolean) =>
    set({
      working_days: checked ? [...form.working_days, day] : form.working_days.filter((d) => d !== day),
    });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Service area</CardTitle>
          <p className="text-sm text-muted-foreground">
            Primary location: {[listing.city, listing.state].filter(Boolean).join(", ") || "Not set"}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:max-w-xs">
            <Label htmlFor="mp-radius">Travel radius (miles)</Label>
            <Input
              id="mp-radius"
              type="number"
              min={1}
              value={form.service_radius_miles}
              onChange={(e) => set({ service_radius_miles: Number(e.target.value) })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="mp-zips">ZIP codes served</Label>
            <div className="flex gap-2 sm:max-w-xs">
              <Input
                id="mp-zips"
                inputMode="numeric"
                placeholder="19104"
                value={zipDraft}
                onChange={(e) => setZipDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addZip();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={addZip}>
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {form.marketplace_service_area_zips.map((zip) => (
                <Badge key={zip} variant="secondary" className="gap-1">
                  {zip}
                  <button
                    type="button"
                    aria-label={`Remove ${zip}`}
                    onClick={() =>
                      set({
                        marketplace_service_area_zips: form.marketplace_service_area_zips.filter((z) => z !== zip),
                      })
                    }
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Marketplace availability</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium text-foreground">Accept new customers</p>
              <p className="text-sm text-muted-foreground">Turn off to keep your listing visible but closed to new customers.</p>
            </div>
            <Switch
              checked={form.marketplace_accept_new_customers}
              onCheckedChange={(v) => set({ marketplace_accept_new_customers: v })}
              aria-label="Accept new customers"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="mp-lead">Minimum lead time (hours)</Label>
              <Input
                id="mp-lead"
                type="number"
                min={0}
                value={form.min_lead_time_hours}
                onChange={(e) => set({ min_lead_time_hours: Number(e.target.value) })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mp-advance">Maximum advance (days)</Label>
              <Input
                id="mp-advance"
                type="number"
                min={1}
                value={form.max_advance_days}
                onChange={(e) => set({ max_advance_days: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Available days</Label>
            <div className="flex flex-wrap gap-3">
              {DAYS.map((day) => (
                <label key={day} className="flex cursor-pointer items-center gap-2">
                  <Checkbox
                    checked={form.working_days.includes(day)}
                    onCheckedChange={(checked) => toggleDay(day, !!checked)}
                  />
                  <span className="text-sm">{day}</span>
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Booking preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium text-foreground">Automatically accept bookings</p>
              <p className="text-sm text-muted-foreground">Marketplace requests are confirmed instantly.</p>
            </div>
            <Switch
              checked={form.marketplace_auto_accept}
              onCheckedChange={(v) => set({ marketplace_auto_accept: v, require_approval: v ? false : form.require_approval })}
              aria-label="Automatically accept bookings"
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium text-foreground">Require approval before booking</p>
              <p className="text-sm text-muted-foreground">Requests land as pending until you accept them.</p>
            </div>
            <Switch
              checked={form.require_approval}
              onCheckedChange={(v) => set({ require_approval: v, marketplace_auto_accept: v ? false : form.marketplace_auto_accept })}
              aria-label="Require approval before booking"
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium text-foreground">Allow same-day bookings</p>
            </div>
            <Switch
              checked={form.marketplace_allow_same_day}
              onCheckedChange={(v) => set({ marketplace_allow_same_day: v })}
              aria-label="Allow same-day bookings"
            />
          </div>
          <div className="grid gap-2 sm:max-w-xs">
            <Label htmlFor="mp-cap">Maximum marketplace jobs per day</Label>
            <Input
              id="mp-cap"
              type="number"
              min={0}
              placeholder="No limit"
              value={form.marketplace_max_jobs_per_day ?? ""}
              onChange={(e) =>
                set({ marketplace_max_jobs_per_day: e.target.value === "" ? null : Number(e.target.value) })
              }
            />
          </div>
        </CardContent>
      </Card>

      <Button disabled={saving} onClick={() => onSave(form)}>
        <Save className="mr-2 h-4 w-4" /> {saving ? "Saving…" : "Save availability"}
      </Button>
    </div>
  );
}

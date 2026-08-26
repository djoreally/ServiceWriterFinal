import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Globe, Loader2, Sparkles, AlertTriangle } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { importSiteForOnboarding } from "@/application/queries/onboarding-site-import.query";
import {
  defaultSelection,
  type SiteImportResult,
  type SiteImportSelection,
} from "@/domain/onboarding/site-import-merge";

interface SiteImportStepProps {
  onApply: (result: SiteImportResult, selection: SiteImportSelection) => void;
  onSkip: () => void;
  initialResult?: SiteImportResult | null;
}

const DAY_LABELS: Record<string, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

export const SiteImportStep = ({ onApply, onSkip, initialResult = null }: SiteImportStepProps) => {
  const [url, setUrl] = useState(initialResult?.source_url ?? "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SiteImportResult | null>(initialResult);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [selection, setSelection] = useState<SiteImportSelection | null>(
    initialResult ? defaultSelection(initialResult) : null,
  );

  const runImport = async () => {
    if (!url.trim()) {
      toast.error("Enter your website address first");
      return;
    }
    setLoading(true);
    try {
      const response = await Promise.race([
        importSiteForOnboarding(url.trim()),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("That took too long. You can enter your details manually.")), 90_000)
        ),
      ]);
      setResult(response.result);
      setWarnings(response.warnings);
      setSelection(defaultSelection(response.result));
      toast.success("We pulled in what we found — review it below");
    } catch (error) {
      console.error("Site import failed:", error);
      toast.error(error instanceof Error ? error.message : "We couldn't import that website");
    } finally {
      setLoading(false);
    }
  };

  const toggleService = (index: number) => {
    setSelection((prev) => {
      if (!prev) return prev;
      const has = prev.serviceIndexes.includes(index);
      return {
        ...prev,
        serviceIndexes: has
          ? prev.serviceIndexes.filter((i) => i !== index)
          : [...prev.serviceIndexes, index].sort((a, b) => a - b),
      };
    });
  };

  const toggleSection = (key: "business" | "branding" | "hours" | "serviceArea") => {
    setSelection((prev) => (prev ? { ...prev, [key]: !prev[key] } : prev));
  };

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="text-center pb-2">
        <div className="mx-auto w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center mb-4">
          <Globe className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-2xl">Already have a website?</CardTitle>
        <CardDescription className="text-base">
          Paste your address and we'll pull in your business info, branding, services and hours so you
          don't have to type them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 max-w-xl mx-auto">
        <div className="space-y-2">
          <Label htmlFor="site_url">Your website</Label>
          <div className="flex gap-2">
            <Input
              id="site_url"
              value={url}
              placeholder="myshop.com"
              inputMode="url"
              maxLength={300}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !loading) void runImport();
              }}
              disabled={loading}
            />
            <Button onClick={() => void runImport()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              <span className="ml-2 hidden sm:inline">Import</span>
            </Button>
          </div>
        </div>

        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <p className="text-xs text-muted-foreground text-center">
              Reading your site — this usually takes 10–30 seconds.
            </p>
          </div>
        )}

        {!loading && result && selection && (
          <div className="space-y-5">
            {warnings.length > 0 && (
              <div className="flex gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <ul className="space-y-1">
                  {warnings.map((w) => <li key={w}>{w}</li>)}
                </ul>
              </div>
            )}

            {/* Business identity */}
            <div className="rounded-lg border p-4 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox checked={selection.business} onCheckedChange={() => toggleSection("business")} />
                <span className="font-medium">Business details</span>
              </label>
              <div className="grid gap-1 text-sm text-muted-foreground pl-7">
                <span>{result.business.name || "No name detected"}</span>
                {result.business.owner_name && <span>{result.business.owner_name}</span>}
                {result.business.email && <span>{result.business.email}</span>}
                {result.business.phone && <span>{result.business.phone}</span>}
              </div>
            </div>

            {/* Branding */}
            <div className="rounded-lg border p-4 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <Checkbox checked={selection.branding} onCheckedChange={() => toggleSection("branding")} />
                <span className="font-medium">Branding</span>
              </label>
              <div className="flex items-center gap-3 pl-7">
                {result.branding.logo_url && (
                  <img
                    src={result.branding.logo_url}
                    alt={`${result.business.name || "Business"} logo detected from website`}
                    className="h-10 w-10 rounded object-contain bg-muted"
                    loading="lazy"
                  />
                )}
                {[result.branding.primary_color, result.branding.secondary_color, result.branding.background_color]
                  .filter(Boolean)
                  .map((color) => (
                    <span
                      key={color as string}
                      className="h-8 w-8 rounded-md border"
                      style={{ backgroundColor: color as string }}
                      title={color as string}
                    />
                  ))}
                {result.branding.font_family && (
                  <span className="text-sm text-muted-foreground">{result.branding.font_family}</span>
                )}
              </div>
            </div>

            {/* Service area */}
            {(result.service_area.base_address || result.service_area.cities.length > 0) && (
              <div className="rounded-lg border p-4 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <Checkbox
                    checked={selection.serviceArea}
                    onCheckedChange={() => toggleSection("serviceArea")}
                  />
                  <span className="font-medium">Service area</span>
                </label>
                <div className="pl-7 text-sm text-muted-foreground space-y-1">
                  {result.service_area.base_address && <div>{result.service_area.base_address}</div>}
                  {result.service_area.radius_miles_hint && (
                    <div>{result.service_area.radius_miles_hint} mile radius</div>
                  )}
                  {result.service_area.cities.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {result.service_area.cities.slice(0, 8).map((city) => (
                        <Badge key={city} variant="secondary">{city}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Hours */}
            {result.hours.length > 0 && (
              <div className="rounded-lg border p-4 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <Checkbox checked={selection.hours} onCheckedChange={() => toggleSection("hours")} />
                  <span className="font-medium">Business hours</span>
                </label>
                <div className="pl-7 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-muted-foreground">
                  {result.hours.map((h) => (
                    <div key={h.day} className="flex justify-between">
                      <span>{DAY_LABELS[h.day] ?? h.day}</span>
                      <span>{h.is_open ? `${h.open}–${h.close}` : "Closed"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Services */}
            {result.services.length > 0 && (
              <div className="rounded-lg border p-4 space-y-3">
                <div className="font-medium">Services found ({result.services.length})</div>
                <div className="space-y-2">
                  {result.services.map((service, index) => (
                    <label
                      key={`${service.name}-${index}`}
                      className="flex items-start gap-3 cursor-pointer rounded-md p-2 hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={selection.serviceIndexes.includes(index)}
                        onCheckedChange={() => toggleService(index)}
                      />
                      <span className="flex-1">
                        <span className="block text-sm font-medium">{service.name}</span>
                        {service.description && (
                          <span className="block text-xs text-muted-foreground line-clamp-2">
                            {service.description}
                          </span>
                        )}
                      </span>
                      {service.price !== null ? (
                        <Badge variant="secondary">${service.price}</Badge>
                      ) : (
                        <Badge variant="outline">Needs price</Badge>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <Button className="w-full" size="lg" onClick={() => onApply(result, selection)}>
              Use these details
            </Button>
          </div>
        )}

        <Button variant="ghost" className="w-full" onClick={onSkip} disabled={loading}>
          Skip — I'll enter everything manually
        </Button>
      </CardContent>
    </Card>
  );
};

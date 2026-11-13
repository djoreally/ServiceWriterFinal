import { useEffect, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import {
  lookupRecallsByVin,
  type RecallLookupData,
} from "@/application/queries/recall-lookup.query";
import { VIN_FORMAT_PATTERN } from "@/lib/booking-requirements";

/**
 * Booking recall notice (SW-68).
 *
 * Once a complete, valid VIN settles in the booking vehicle form,
 * look up — quietly, in the background — what recalls NHTSA has on
 * file for that year/make/model (free federal data, via
 * POST /v1/public-bookings/recall-lookup) and show them as a
 * dismissible notice.
 *
 * Ground rules baked in:
 * - FAIL-SOFT: the lookup never throws into this form, never
 *   disables or delays anything, and any failure renders NOTHING.
 * - HONEST COPY: NHTSA files recalls by year/make/model, so the
 *   heading says "on file for a <year make model>" — never that
 *   THIS car has an open recall. Only a dealer can confirm whether
 *   this specific car still needs a repair, and the notice says so.
 * - Zero campaigns on file renders nothing: the notice exists to
 *   flag recalls, not to add noise to a clean booking.
 */

const SETTLE_MS = 600;

/** vPIC answers makes in all caps ("FORD"); prose reads "Ford". Short names (BMW, GMC) are acronyms and stay as-is. */
function displayName(value: string): string {
  const clean = value.trim();
  if (clean.length > 3 && clean === clean.toUpperCase()) {
    return clean
      .toLowerCase()
      .replace(/\b\w/g, (ch) => ch.toUpperCase());
  }
  return clean;
}

export function VinRecallNotice({ vin }: { vin: string }) {
  const cleanVin = (vin || "").trim().toUpperCase();
  const isCompleteVin = VIN_FORMAT_PATTERN.test(cleanVin);

  const [result, setResult] = useState<{ vin: string; data: RecallLookupData } | null>(null);
  const [loadingVin, setLoadingVin] = useState<string | null>(null);
  const [dismissedVin, setDismissedVin] = useState<string | null>(null);
  const requestedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isCompleteVin) return;
    if (requestedRef.current === cleanVin) return;
    // Let the VIN "settle" — a customer still typing (or a decode
    // still filling the field) shouldn't fire a lookup per keystroke.
    const timer = setTimeout(() => {
      requestedRef.current = cleanVin;
      setLoadingVin(cleanVin);
      lookupRecallsByVin(cleanVin)
        .then((data) => {
          if (data) setResult({ vin: cleanVin, data });
        })
        .catch(() => {
          // The query is fail-soft by contract; this is belt and braces.
        })
        .finally(() => {
          setLoadingVin((current) => (current === cleanVin ? null : current));
        });
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [cleanVin, isCompleteVin]);

  if (!isCompleteVin) return null;
  if (dismissedVin === cleanVin) return null;

  const active = result && result.vin === cleanVin ? result.data : null;

  if (!active) {
    if (loadingVin === cleanVin) {
      return (
        <p className="text-xs text-muted-foreground" data-testid="vin-recall-loading">
          Checking NHTSA for recalls on this vehicle…
        </p>
      );
    }
    return null;
  }

  if (active.campaigns.length === 0) return null;

  const { year, make, model } = active.vehicle;
  const vehicleName = `${year} ${displayName(make)} ${displayName(model)}`;
  const count = active.campaigns.length;

  return (
    <div
      className="rounded-lg border border-amber-500/50 bg-amber-50 p-4 text-amber-900 dark:bg-amber-950/20 dark:text-amber-100"
      data-testid="vin-recall-notice"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            NHTSA has {count} recall{count === 1 ? "" : "s"} on file for a {vehicleName}
          </span>
        </div>
        <button
          type="button"
          aria-label="Dismiss recall notice"
          onClick={() => setDismissedVin(cleanVin)}
          className="shrink-0 rounded p-0.5 opacity-70 transition-opacity hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 max-h-64 space-y-3 overflow-y-auto pr-1">
        {active.campaigns.map((campaign, index) => (
          <div key={campaign.campaignNumber || index} className="text-sm">
            {campaign.component && <p className="font-medium">{campaign.component}</p>}
            {campaign.summary && <p className="opacity-80">{campaign.summary}</p>}
            {campaign.remedy && (
              <p>
                <span className="font-medium">Fix: </span>
                {campaign.remedy}
              </p>
            )}
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs opacity-80">
        These recalls are on file with NHTSA for this year, make, and model — they may
        already have been repaired on this car. Only a dealer can confirm whether this
        specific car still needs a repair.
      </p>
    </div>
  );
}

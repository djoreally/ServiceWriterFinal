/**
 * LocationStep - Step 1: Service Location
 * Handles address entry and service area verification
 */

import { memo, useMemo } from "react";
import { CheckCircle2, MapPin, Navigation } from "lucide-react";
import { AddressDisplay } from "@/components/booking/AddressDisplay";

interface LocationStepProps {
  customerAddress: string;
  setCustomerAddress: (value: string) => void;
  addressLine2: string;
  setAddressLine2: (value: string) => void;
  city: string;
  setCity: (value: string) => void;
  state: string;
  setState: (value: string) => void;
  zipCode: string;
  setZipCode: (value: string) => void;
  locationVerified: boolean;
  setLocationVerified: (value: boolean) => void;
  distanceMessage: string;
}

/** ⚡ Memoized — only re-renders when location props actually change */
export const LocationStep = memo(function LocationStep({
  customerAddress,
  setCustomerAddress,
  addressLine2,
  setAddressLine2,
  city,
  setCity,
  state,
  setState,
  zipCode,
  setZipCode,
  locationVerified,
  setLocationVerified,
  distanceMessage,
}: LocationStepProps) {
  const fullAddress = useMemo(
    () => [customerAddress, addressLine2, city, state, zipCode].filter(Boolean).join(", "),
    [addressLine2, city, customerAddress, state, zipCode],
  );
  const mapQuery = encodeURIComponent(fullAddress || `${city || "Philadelphia"}, ${state || "PA"}`);

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[minmax(360px,0.95fr)_minmax(460px,1.05fr)] lg:items-start">
      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm lg:sticky lg:top-28">
        <div className="relative h-[300px] bg-slate-100 lg:h-[430px]">
          {fullAddress ? (
            <iframe
              title="Service address map"
              src={`https://www.google.com/maps?q=${mapQuery}&output=embed`}
              className="h-full w-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center bg-[linear-gradient(32deg,transparent_48%,rgba(59,130,246,.16)_49%,rgba(59,130,246,.16)_52%,transparent_53%),linear-gradient(145deg,transparent_42%,rgba(15,23,42,.08)_43%,rgba(15,23,42,.08)_46%,transparent_47%)] text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg"><Navigation className="h-6 w-6" /></div>
              <p className="mt-4 text-sm font-semibold text-slate-900">Your service location will appear here</p>
              <p className="mt-1 max-w-xs text-xs text-slate-600">Start typing your street address and choose a suggestion.</p>
            </div>
          )}
          <span className="absolute bottom-3 left-3 rounded-md bg-white/95 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm">Mobile service area</span>
        </div>
        <div className="p-4"><p className="text-sm font-semibold text-slate-900">We come to you</p><p className="mt-1 text-xs text-slate-600">Choose the exact service address so availability and dispatch use the same location.</p></div>
      </div>

      <div className="min-w-0">
        <div className="mb-5 text-left">
          <MapPin className="mb-3 h-9 w-9 text-primary" />
          <h2 className="mb-2 text-2xl font-bold sm:text-3xl">Where should we service your vehicle?</h2>
          <p className="text-muted-foreground">Start typing your street address and select the matching address.</p>
        </div>

        <AddressDisplay
          customerAddress={customerAddress}
          setCustomerAddress={setCustomerAddress}
          addressLine2={addressLine2}
          setAddressLine2={setAddressLine2}
          city={city}
          setCity={setCity}
          state={state}
          setState={setState}
          zipCode={zipCode}
          setZipCode={setZipCode}
          locationVerified={locationVerified}
          setLocationVerified={setLocationVerified}
          distanceMessage={distanceMessage}
        />
        {locationVerified && <div className="mt-3 flex animate-in items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-800 duration-200"><CheckCircle2 className="h-5 w-5" /> You're in our service area</div>}
      </div>
    </div>
  );
});

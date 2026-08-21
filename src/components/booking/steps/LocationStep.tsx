/**
 * LocationStep - Step 1: Service Location
 * Handles address entry and service area verification
 */

import { memo } from "react";
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
  return (
    <div className="mx-auto grid max-w-3xl gap-6 md:grid-cols-[0.9fr_1.1fr] md:items-start">
      <div className="overflow-hidden rounded-2xl border bg-blue-50 shadow-sm">
        <div className="relative h-44 bg-[linear-gradient(32deg,transparent_48%,rgba(59,130,246,.16)_49%,rgba(59,130,246,.16)_52%,transparent_53%),linear-gradient(145deg,transparent_42%,rgba(15,23,42,.08)_43%,rgba(15,23,42,.08)_46%,transparent_47%)]">
          <div className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md bg-blue-600 text-white shadow-lg"><Navigation className="h-5 w-5" /></div>
          <span className="absolute bottom-3 left-3 rounded-md bg-white/90 px-3 py-1 text-xs font-medium text-slate-700">Mobile service area</span>
        </div>
        <div className="p-4"><p className="text-sm font-semibold text-slate-900">We come to you</p><p className="mt-1 text-xs text-slate-600">Confirm your address to check local availability.</p></div>
      </div>
      <div>
      <div className="mb-5 text-left">
        <MapPin className="mb-3 h-9 w-9 text-primary" />
        <h2 className="text-2xl font-bold mb-2">Where should we service your vehicle?</h2>
        <p className="text-muted-foreground">Enter your full address to continue</p>
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

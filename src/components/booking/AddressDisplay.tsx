import { useRef, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AddressAutofill } from "@mapbox/search-js-react";
import { MAPBOX_ACCESS_TOKEN } from "@/lib/mapbox";
import { CheckCircle2, AlertCircle } from "lucide-react";

interface AddressDisplayProps {
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

export function AddressDisplay({
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
}: AddressDisplayProps) {
  const addressInputRef = useRef<HTMLInputElement>(null);

  const syncAutofillValuesFromForm = useCallback(() => {
    const form = addressInputRef.current?.closest("form");
    if (!form) return;

    const line1Input = form.querySelector('[name="address-line1"]') as HTMLInputElement | null;
    const line2Input = form.querySelector('[name="address-line2"]') as HTMLInputElement | null;
    const cityInput = form.querySelector('[name="address-level2"]') as HTMLInputElement | null;
    const stateInput = form.querySelector('[name="address-level1"]') as HTMLInputElement | null;
    const zipInput = form.querySelector('[name="postal-code"]') as HTMLInputElement | null;

    if (line1Input?.value && line1Input.value !== customerAddress) setCustomerAddress(line1Input.value);
    if (line2Input && line2Input.value !== addressLine2) setAddressLine2(line2Input.value);
    if (cityInput?.value && cityInput.value !== city) setCity(cityInput.value);
    if (stateInput?.value && stateInput.value !== state) setState(stateInput.value);
    if (zipInput?.value && zipInput.value !== zipCode) setZipCode(zipInput.value);
    setLocationVerified(false);
  }, [addressLine2, city, customerAddress, setAddressLine2, setCity, setCustomerAddress, setLocationVerified, setState, setZipCode, state, zipCode]);

  // Handle autofill events from Mapbox
  useEffect(() => {
    const handleAutofill = (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (!target) return;
      
      // After autofill, sync the hidden fields
      setTimeout(() => {
        const form = target.closest('form');
        if (form) syncAutofillValuesFromForm();
      }, 100);
    };

    const addressInput = addressInputRef.current;
    if (addressInput) {
      addressInput.addEventListener('change', handleAutofill);
      addressInput.addEventListener('input', handleAutofill);
      addressInput.addEventListener('blur', handleAutofill);
    }

    return () => {
      if (addressInput) {
        addressInput.removeEventListener('change', handleAutofill);
        addressInput.removeEventListener('input', handleAutofill);
        addressInput.removeEventListener('blur', handleAutofill);
      }
    };
  }, [customerAddress, addressLine2, city, state, zipCode, setCustomerAddress, setAddressLine2, setCity, setState, setZipCode, setLocationVerified, syncAutofillValuesFromForm]);

  const resetVerification = () => {
    setLocationVerified(false);
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <form autoComplete="on">
          <AddressAutofill
            accessToken={MAPBOX_ACCESS_TOKEN}
            onRetrieve={() => {
              // Mapbox selection may update DOM values without triggering React onChange.
              // Sync all address fields so Step 1 validation/verification can proceed.
              requestAnimationFrame(syncAutofillValuesFromForm);
            }}
          >
            <div className="space-y-4">
              <div>
                <Label htmlFor="address-line1">Street Address *</Label>
                <Input
                  id="address-line1"
                  ref={addressInputRef}
                  name="address-line1"
                  autoComplete="address-line1"
                  value={customerAddress}
                  onChange={(e) => {
                    setCustomerAddress(e.target.value);
                    resetVerification();
                  }}
                  placeholder="Start typing your address..."
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="address-line2">Apartment, suite, etc.</Label>
                <Input
                  id="address-line2"
                  name="address-line2"
                  autoComplete="address-line2"
                  value={addressLine2}
                  onChange={(e) => setAddressLine2(e.target.value)}
                  placeholder="Apt 4B (optional)"
                  className="mt-1"
                />
              </div>

              <div className="grid grid-cols-6 gap-4">
                <div className="col-span-3">
                  <Label htmlFor="address-level2">City *</Label>
                  <Input
                    id="address-level2"
                    name="address-level2"
                    autoComplete="address-level2"
                    value={city}
                    onChange={(e) => {
                      setCity(e.target.value);
                      resetVerification();
                    }}
                    placeholder="City"
                    className="mt-1"
                  />
                </div>
                <div className="col-span-1">
                  <Label htmlFor="address-level1">State *</Label>
                  <Input
                    id="address-level1"
                    name="address-level1"
                    autoComplete="address-level1"
                    value={state}
                    onChange={(e) => {
                      setState(e.target.value);
                      resetVerification();
                    }}
                    placeholder="ST"
                    className="mt-1"
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="postal-code">ZIP Code *</Label>
                  <Input
                    id="postal-code"
                    name="postal-code"
                    autoComplete="postal-code"
                    value={zipCode}
                    onChange={(e) => {
                      setZipCode(e.target.value);
                      resetVerification();
                    }}
                    placeholder="12345"
                    className="mt-1"
                  />
                </div>
              </div>
            </div>
          </AddressAutofill>

          {/* Full Address Summary */}
          {customerAddress && city && state && zipCode && (
            <div className="mt-4 p-3 bg-muted/50 rounded-lg">
              <p className="text-sm font-medium text-muted-foreground mb-1">Service Address:</p>
              <p className="text-sm">
                {customerAddress}
                {addressLine2 && `, ${addressLine2}`}
              </p>
              <p className="text-sm">{city}, {state} {zipCode}</p>
            </div>
          )}

          <div className="mt-6">
            {locationVerified && (
              <div className="flex items-center gap-2 text-success bg-success/10 p-3 rounded-lg">
                <CheckCircle2 className="h-5 w-5" />
                <span>{distanceMessage || "Great! We service your area."}</span>
              </div>
            )}

            {!locationVerified && distanceMessage && (
              <div className="flex items-center gap-2 text-destructive bg-destructive/10 p-3 rounded-lg mt-4">
                <AlertCircle className="h-5 w-5" />
                <span>{distanceMessage}</span>
              </div>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

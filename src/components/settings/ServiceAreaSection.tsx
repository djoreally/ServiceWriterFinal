/**
 * ServiceAreaSection - Service radius and location settings
 */

import { useRef, useState } from "react";
import { Navigation, MapPin, Loader2, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { LazyServiceAreaMap } from "@/components/settings/LazyServiceAreaMap";
import { MAPBOX_ACCESS_TOKEN } from "@/lib/mapbox";
import { toast } from "@/components/ui/sonner";

interface ServiceAreaData {
  service_address: string;
  service_coordinates: { lat: number; lng: number } | null;
  service_radius_miles: number;
}

interface ServiceAreaSectionProps {
  serviceArea: ServiceAreaData;
  onServiceAreaChange: (updates: Partial<ServiceAreaData>) => void;
}

export function ServiceAreaSection({ serviceArea, onServiceAreaChange }: ServiceAreaSectionProps) {
  const [geocodingAddress, setGeocodingAddress] = useState(false);
  const serviceAddressInputRef = useRef<HTMLInputElement>(null);

  const geocodeServiceAddress = async () => {
    if (!serviceArea.service_address.trim()) {
      toast.error("Please enter a service address");
      return;
    }

    if (!MAPBOX_ACCESS_TOKEN) {
      toast.error("Mapbox token not configured. Please contact support.");
      return;
    }

    setGeocodingAddress(true);
    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(serviceArea.service_address)}.json?access_token=${MAPBOX_ACCESS_TOKEN}&limit=1`
      );

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        console.error("Mapbox geocoding HTTP error:", response.status, errText);
        toast.error(response.status === 401
          ? "Mapbox token is invalid. Please check your configuration."
          : "Geocoding service error. Please try again.");
        setGeocodingAddress(false);
        return;
      }

      const data = await response.json();

      if (data.features && data.features.length > 0) {
        const [lng, lat] = data.features[0].center;
        const fullAddress = data.features[0].place_name;
        onServiceAreaChange({
          service_address: fullAddress,
          service_coordinates: { lat, lng },
        });
        toast.success("Address verified and coordinates saved!");
      } else {
        toast.error("Could not find this address. Please check and try again.");
      }
    } catch {
      toast.error("Failed to verify address. Please try again.");
    }
    setGeocodingAddress(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Navigation className="h-5 w-5" />
          Service Area
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Set your service radius to define the area you serve. Customers outside this area will not be able to book online.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="service_address">Business Location (Base Address)</Label>
            <div className="flex gap-2">
              <Input
                id="service_address"
                ref={serviceAddressInputRef}
                value={serviceArea.service_address}
                onChange={(e) => onServiceAreaChange({ 
                  service_address: e.target.value, 
                  service_coordinates: null 
                })}
                placeholder="Enter your business address"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                onClick={geocodeServiceAddress}
                disabled={geocodingAddress}
              >
                {geocodingAddress ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MapPin className="h-4 w-4" />
                )}
                <span className="ml-2 hidden sm:inline">Verify</span>
              </Button>
            </div>
            {serviceArea.service_coordinates && (
              <p className="text-xs text-gray-600 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Address verified - coordinates saved
              </p>
            )}
            {!serviceArea.service_coordinates && serviceArea.service_address && (
              <p className="text-xs text-muted-foreground">
                Click "Verify" to confirm your address and enable service area validation
              </p>
            )}
          </div>

          <div className="grid gap-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="service_radius">Service Radius</Label>
              <span className="text-lg font-semibold text-primary">{serviceArea.service_radius_miles} miles</span>
            </div>
            <Slider
              id="service_radius"
              min={5}
              max={100}
              step={5}
              value={[serviceArea.service_radius_miles]}
              onValueChange={(value) => onServiceAreaChange({ service_radius_miles: value[0] })}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>5 miles</span>
              <span>50 miles</span>
              <span>100 miles</span>
            </div>
          </div>
        </div>

        {serviceArea.service_coordinates && (
          <div className="space-y-4">
            <div>
              <p className="font-medium mb-3">Service Area Preview</p>
              <LazyServiceAreaMap
                coordinates={serviceArea.service_coordinates}
                radiusMiles={serviceArea.service_radius_miles}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Customers within {serviceArea.service_radius_miles} miles of your business location will be able to book online.
              Others will be notified that your services are not available in their area.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

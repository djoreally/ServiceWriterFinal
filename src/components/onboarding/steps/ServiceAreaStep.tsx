import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";

interface ServiceAreaData {
  service_address: string;
  service_radius_miles: number;
  timezone: string;
  service_coordinates: { lat: number; lng: number } | null;
}

interface ServiceAreaStepProps {
  data: ServiceAreaData;
  onUpdate: (data: Partial<ServiceAreaData>) => void;
  onNext: () => void;
  onBack: () => void;
}

const COMMON_TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "America/Phoenix", label: "Arizona (MST)" },
  { value: "America/Anchorage", label: "Alaska Time" },
  { value: "Pacific/Honolulu", label: "Hawaii Time" },
];

export const ServiceAreaStep = ({ data, onUpdate, onNext, onBack }: ServiceAreaStepProps) => {
  const [geocoding, setGeocoding] = useState(false);

  const handleAddressBlur = async () => {
    if (!data.service_address.trim()) return;
    
    const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN;
    if (!mapboxToken) return;

    setGeocoding(true);
    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          data.service_address
        )}.json?access_token=${mapboxToken}&country=US&types=address,place`
      );
      const result = await response.json();

      if (result.features?.length > 0) {
        const [lng, lat] = result.features[0].center;
        onUpdate({
          service_coordinates: { lat, lng },
          service_address: result.features[0].place_name || data.service_address,
        });
      }
    } catch (error) {
      console.error("Geocoding error:", error);
    } finally {
      setGeocoding(false);
    }
  };

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="text-center pb-2">
        <div className="mx-auto w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center mb-4">
          <MapPin className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-2xl">Where do you operate?</CardTitle>
        <CardDescription className="text-base">
          Set your service area so customers know you can reach them
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 max-w-md mx-auto">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="service_address">Service Address</Label>
            <div className="relative">
              <Input
                id="service_address"
                value={data.service_address}
                onChange={(e) => onUpdate({ service_address: e.target.value })}
                onBlur={handleAddressBlur}
                placeholder="123 Main St, City, State"
              />
              {geocoding && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              This is where you're based or where you start your service
            </p>
          </div>

          <div className="space-y-2">
            <Label>Service Radius: {data.service_radius_miles} miles</Label>
            <Slider
              value={[data.service_radius_miles]}
              onValueChange={([value]) => onUpdate({ service_radius_miles: value })}
              min={5}
              max={100}
              step={5}
              className="py-4"
            />
            <p className="text-xs text-muted-foreground">
              How far are you willing to travel to service customers?
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Select
              value={data.timezone}
              onValueChange={(value) => onUpdate({ timezone: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent>
                {COMMON_TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} className="flex-1">
            Back
          </Button>
          <Button onClick={onNext} className="flex-1">
            Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

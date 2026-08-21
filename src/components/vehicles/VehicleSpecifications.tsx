import { useEffect, useState } from "react";
import { fetchVehicleSpecifications, type VehicleSpec } from "@/application/queries/vehicle-specifications.query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Droplets, Gauge, Filter, Wind, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface VehicleSpecificationsProps {
  year: number;
  make: string;
  model: string;
}

// VehicleSpec imported from application layer

export const VehicleSpecifications = ({ year, make, model }: VehicleSpecificationsProps) => {
  const [specs, setSpecs] = useState<VehicleSpec[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSpecs = async () => {
      setLoading(true);
      const data = await fetchVehicleSpecifications(year, make, model);
      setSpecs(data);
      setLoading(false);
    };

    if (year && make && model) {
      loadSpecs();
    }
  }, [year, make, model]);

  if (loading) {
    return (
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Gauge className="h-5 w-5" />
            Vehicle Specifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i}>
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-5 w-24" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (specs.length === 0) {
    return (
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Gauge className="h-5 w-5" />
            Vehicle Specifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No specifications found for {year} {make} {model}</p>
            <p className="text-sm mt-2">Ask the AI assistant for vehicle-specific recommendations</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // If multiple engine options, show them all
  const hasMultipleEngines = specs.length > 1;

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Gauge className="h-5 w-5" />
            Vehicle Specifications
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            {specs[0].year} Data
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {specs.map((spec, index) => (
          <div key={spec.id} className={index > 0 ? "pt-4 border-t border-border/50" : ""}>
            {hasMultipleEngines && spec.engine && (
              <div className="mb-4">
                <Badge variant="outline" className="text-sm">
                  {spec.engine} Engine
                </Badge>
              </div>
            )}
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {spec.engine && !hasMultipleEngines && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                    <Gauge className="h-3 w-3" /> Engine
                  </p>
                  <p className="font-medium">{spec.engine}</p>
                </div>
              )}
              
              {spec.oil_type && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                    <Droplets className="h-3 w-3" /> Oil Type
                  </p>
                  <p className="font-medium text-primary">{spec.oil_type}</p>
                </div>
              )}
              
              {spec.oil_capacity && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Oil Capacity</p>
                  <p className="font-medium">{spec.oil_capacity}</p>
                </div>
              )}
              
              {spec.oil_filter && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                    <Filter className="h-3 w-3" /> Oil Filter
                  </p>
                  <p className="font-medium">{spec.oil_filter}</p>
                </div>
              )}
              
              {spec.air_filter && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
                    <Wind className="h-3 w-3" /> Air Filter
                  </p>
                  <p className="font-medium">{spec.air_filter}</p>
                </div>
              )}
              
              {spec.cabin_filter && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Cabin Filter</p>
                  <p className="font-medium">{spec.cabin_filter}</p>
                </div>
              )}
              
              {spec.transmission_fluid && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Trans Fluid</p>
                  <p className="font-medium">{spec.transmission_fluid}</p>
                </div>
              )}
              
              {spec.coolant_type && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Coolant</p>
                  <p className="font-medium">{spec.coolant_type}</p>
                </div>
              )}
              
              {spec.tire_size && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Tire Size</p>
                  <p className="font-medium">{spec.tire_size}</p>
                </div>
              )}

              {spec.wiper_blade_driver && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Wiper (Driver)</p>
                  <p className="font-medium">{spec.wiper_blade_driver}</p>
                </div>
              )}

              {spec.wiper_blade_passenger && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Wiper (Pass.)</p>
                  <p className="font-medium">{spec.wiper_blade_passenger}</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

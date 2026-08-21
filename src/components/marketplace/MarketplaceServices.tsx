import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import type { MarketplaceService } from "@/application/queries/marketplace-provider.query";

interface Props {
  services: MarketplaceService[];
}

export function MarketplaceServices({ services }: Props) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Services offered</CardTitle>
          <p className="text-sm text-muted-foreground">
            Active catalog services are bookable by marketplace customers.
          </p>
        </div>
        <Button asChild size="sm">
          <Link to="/service-catalog">
            <Plus className="mr-2 h-4 w-4" /> Add service
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {services.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No services yet. Add services in your catalog to make them bookable.
          </p>
        )}
        {services.map((service) => (
          <div
            key={service.id}
            className="flex flex-col gap-2 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium text-foreground">{service.name}</p>
                <Badge variant={service.is_active ? "secondary" : "outline"}>
                  {service.is_active ? "Bookable" : "Hidden"}
                </Badge>
              </div>
              {service.description && (
                <p className="text-sm text-muted-foreground">{service.description}</p>
              )}
            </div>
            <div className="text-right">
              <p className="font-semibold text-foreground">
                {service.default_price != null ? `$${Number(service.default_price).toFixed(2)}` : "Request quote"}
              </p>
              {service.estimated_duration != null && (
                <p className="text-xs text-muted-foreground">{service.estimated_duration} min</p>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

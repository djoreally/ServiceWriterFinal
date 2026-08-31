import { useEffect, useState } from "react";
import { FleetOSLayout } from "@/components/layout/FleetOSLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { fetchFleetLocations, type FleetLocationSummary } from "@/application/queries/fleet.query";
import {
  MapPin,
  Search,
  Plus,
  Clock,
  Phone,
  User,
  Building2,
  AlertCircle,
} from "lucide-react";
import { AddLocationDialog } from "@/components/fleet/AddLocationDialog";

const FleetLocationsPage = () => {
  const [locations, setLocations] = useState<FleetLocationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const loadLocations = async () => {
    try {
      const data = await fetchFleetLocations();
      setLocations(data);
    } catch (err) {
      console.error("[FleetLocationsPage] Error loading locations:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(() => loadLocations());
  }, []);

  const filtered = locations.filter((l) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      l.name?.toLowerCase().includes(q) ||
      l.city?.toLowerCase().includes(q) ||
      l.state?.toLowerCase().includes(q) ||
      l.fleet_clients?.company_name?.toLowerCase().includes(q) ||
      l.address?.toLowerCase().includes(q)
    );
  });

  return (
    <FleetOSLayout title="Locations">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {locations.length} location{locations.length !== 1 ? "s" : ""} across fleet accounts
          </p>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add Location
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, city, state, address, or company..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Location List */}
        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading locations...</p>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <MapPin className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="font-medium">No locations yet</p>
              <p className="text-sm text-muted-foreground mt-1 mb-4">
                Add service locations: HQ, warehouses, job sites, project locations
              </p>
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Add Location
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((l) => (
              <Card
                key={l.id}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                          <MapPin className="h-4 w-4 text-blue-600" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">{l.name}</p>
                            {l.is_primary && (
                              <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px]">
                                Primary
                              </Badge>
                            )}
                          </div>
                          {l.address && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {l.address}{l.city && `, ${l.city}`}{l.state && `, ${l.state}`} {l.postal_code}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground ml-10">
                        {l.fleet_clients?.company_name && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" /> {l.fleet_clients.company_name}
                          </span>
                        )}
                        {(l.service_window_start || l.service_window_end) && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {l.service_window_start || "?"} – {l.service_window_end || "?"}
                          </span>
                        )}
                        {l.site_contact_name && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" /> {l.site_contact_name}
                          </span>
                        )}
                        {l.site_contact_phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {l.site_contact_phone}
                          </span>
                        )}
                        {l.access_instructions && (
                          <span className="flex items-center gap-1 text-amber-600">
                            <AlertCircle className="h-3 w-3" /> Access notes
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
      <AddLocationDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={loadLocations}
      />
    </FleetOSLayout>
  );
};

export default FleetLocationsPage;

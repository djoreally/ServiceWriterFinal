import { useState, useEffect } from "react";
import { lookupCarfaxServiceHistory, type CarfaxServiceRecord } from "@/application/queries/carfax-service-history.query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Car, 
  RefreshCw, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle, 
  History,
  Loader2,
  Info
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";

type ServiceRecord = CarfaxServiceRecord;

interface CarfaxServiceHistoryProps {
  vin: string | null;
  vehicleName: string;
}

export function CarfaxServiceHistory({ vin, vehicleName }: CarfaxServiceHistoryProps) {
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);
  const [hasHistory, setHasHistory] = useState(false);
  const [recordCount, setRecordCount] = useState(0);
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [integrationUnavailable, setIntegrationUnavailable] = useState(false);

  const checkServiceHistory = async () => {
    if (!vin || vin.length !== 17) {
      toast.error("Valid 17-character VIN required for CARFAX lookup");
      return;
    }

    setLoading(true);
    setError(null);
    setIntegrationUnavailable(false);

    try {
      const result = await lookupCarfaxServiceHistory(vin!);

      if (result.integrationUnavailable) {
        setIntegrationUnavailable(true);
        setError(result.error || "CARFAX API not configured");
        setChecked(true);
      } else if (result.success) {
        setHasHistory(result.hasServiceHistory);
        setRecordCount(result.recordCount);
        setServices(result.services);
        setChecked(true);

        if (result.hasServiceHistory) {
          toast.success(`Found ${result.recordCount} service records`);
        } else {
          toast.info("No CARFAX service history found for this vehicle");
        }
      } else {
        setError(result.error || "Failed to check service history");
      }
    } catch (err: any) {
      console.error("CARFAX lookup error:", err);
      setError(err.message || "Failed to check service history");
    }

    setLoading(false);
  };

  // Check if VIN is valid
  const isValidVin = vin && vin.length === 17;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
              <Car className="h-4 w-4 text-orange-600" />
            </div>
            CARFAX Service History
          </CardTitle>
          {checked && hasHistory && (
            <Badge className="bg-gray-500/10 text-gray-600 gap-1">
              <CheckCircle2 className="h-3 w-3" />
              {recordCount} Records
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* VIN Status */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
          <div>
            <p className="text-sm font-medium">Vehicle VIN</p>
            {isValidVin ? (
              <p className="text-xs font-mono text-muted-foreground">{vin}</p>
            ) : (
              <p className="text-xs text-destructive">No valid VIN available</p>
            )}
          </div>
          <Button 
            onClick={checkServiceHistory} 
            disabled={loading || !isValidVin}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : checked ? (
              <RefreshCw className="h-4 w-4" />
            ) : (
              <History className="h-4 w-4" />
            )}
            {checked ? "Refresh" : "Check History"}
          </Button>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        )}

        {/* Integration unavailable */}
        {integrationUnavailable && !loading && (
          <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 space-y-3">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-600">CARFAX API Not Configured</p>
                <p className="text-sm text-muted-foreground mt-1">
                  To enable CARFAX service history lookups, add your CARFAX API credentials 
                  in Settings → CARFAX Integration.
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Required secrets: CARFAX_API_KEY, CARFAX_ACCOUNT_ID
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && !integrationUnavailable && !loading && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {/* Results - No History Found */}
        {checked && !hasHistory && !error && !integrationUnavailable && !loading && (
          <div className="p-4 rounded-lg bg-muted/50 text-center">
            <History className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium">No CARFAX Service History</p>
            <p className="text-xs text-muted-foreground mt-1">
              No service records were found in CARFAX for this VIN
            </p>
          </div>
        )}

        {/* Results - History Found */}
        {checked && hasHistory && !loading && services.length > 0 && (
          <div className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50">
                  <TableHead className="text-xs uppercase">Date</TableHead>
                  <TableHead className="text-xs uppercase">Mileage</TableHead>
                  <TableHead className="text-xs uppercase">Service</TableHead>
                  <TableHead className="text-xs uppercase">Facility</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {services.map((service, index) => (
                  <TableRow key={index} className="border-border/50">
                    <TableCell className="text-sm">
                      {service.date ? format(new Date(service.date), "MMM dd, yyyy") : "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {service.mileage?.toLocaleString() || "—"} mi
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">{service.serviceType}</p>
                        {service.description && (
                          <p className="text-xs text-muted-foreground truncate max-w-48">
                            {service.description}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {service.facility || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            
            <Button variant="outline" className="w-full gap-2" asChild>
              <a href={`https://www.carfax.com/vehicle/${vin}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
                View Full CARFAX Report
              </a>
            </Button>
          </div>
        )}

        {/* Results - History Found but No Details */}
        {checked && hasHistory && !loading && services.length === 0 && (
          <div className="p-4 rounded-lg bg-gray-500/10 border border-gray-500/20 space-y-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-gray-600 mt-0.5" />
              <div>
                <p className="font-medium text-gray-600">Service History Available</p>
                <p className="text-sm text-muted-foreground mt-1">
                  CARFAX shows {recordCount} service record{recordCount !== 1 ? "s" : ""} for this vehicle.
                  Full details are available in the complete CARFAX report.
                </p>
              </div>
            </div>
            <Button variant="outline" className="w-full gap-2" asChild>
              <a href={`https://www.carfax.com/vehicle/${vin}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
                View Full CARFAX Report
              </a>
            </Button>
          </div>
        )}

        {/* Not Yet Checked */}
        {!checked && !loading && (
          <div className="text-center py-2">
            <p className="text-xs text-muted-foreground">
              Click "Check History" to lookup CARFAX service records for this vehicle
            </p>
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center pt-2 border-t border-border/50">
          Powered by CARFAX Service History Check API
        </p>
      </CardContent>
    </Card>
  );
}

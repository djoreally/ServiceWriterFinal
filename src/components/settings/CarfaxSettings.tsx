import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Save, FileText, Download, Upload, ExternalLink, CheckCircle2, AlertCircle, Car } from "lucide-react";

import { fetchCarfaxSettings, fetchCarfaxExports, fetchCarfaxDataStats } from "@/application/queries/carfax.query";
import type { CarfaxSettingsData, CarfaxExportRecord, CarfaxDataStats } from "@/application/queries/carfax.query";
import { saveCarfaxSettings, recordCarfaxExport, fetchCarfaxExportServices, activateCarfaxShop } from "@/application/commands/carfax.command";
import { CarfaxExportMonitor } from "./CarfaxExportMonitor";
import { Loader2 } from "lucide-react";

const US_STATES = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" }, { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" }, { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" }, { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" }, { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" }, { code: "IN", name: "Indiana" }, { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" }, { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" }, { code: "MD", name: "Maryland" }, { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" }, { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" }, { code: "MT", name: "Montana" }, { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" }, { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" }, { code: "NY", name: "New York" }, { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" }, { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" }, { code: "PA", name: "Pennsylvania" }, { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" }, { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" }, { code: "UT", name: "Utah" }, { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" }, { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" }, { code: "WY", name: "Wyoming" }, { code: "DC", name: "District of Columbia" },
];

const CANADIAN_PROVINCES = [
  { code: "AB", name: "Alberta" }, { code: "BC", name: "British Columbia" }, { code: "MB", name: "Manitoba" },
  { code: "NB", name: "New Brunswick" }, { code: "NL", name: "Newfoundland and Labrador" },
  { code: "NS", name: "Nova Scotia" }, { code: "ON", name: "Ontario" }, { code: "PE", name: "Prince Edward Island" },
  { code: "QC", name: "Quebec" }, { code: "SK", name: "Saskatchewan" },
];

interface CarfaxSettings {
  carfax_location_id: string;
  city: string;
  state: string;
  postal_code: string;
  website_url: string;
  business_name: string;
  address: string;
  phone: string;
}

// Types for CARFAX export query results
interface CarfaxVehicle {
  vin: string;
  make: string;
  model: string;
  year: number;
  license_plate: string | null;
  plate_state: string | null;
  mileage: number | null;
  odometer_measure: string | null;
}

interface CarfaxLaborItem {
  description: string;
}

interface CarfaxServiceItem {
  description: string;
  quantity: number | null;
}

interface CarfaxServiceExport {
  id: string;
  service_number: string | null;
  service_date: string;
  service_type: string;
  description: string | null;
  created_at: string;
  vehicles: CarfaxVehicle;
  labor_items: CarfaxLaborItem[];
  service_items: CarfaxServiceItem[];
}
interface ExportRecord {
  id: string;
  export_type: string;
  file_name: string;
  record_count: number;
  export_date: string;
  status: string;
  created_at: string;
}

export function CarfaxSettings() {
  const [settings, setSettings] = useState<CarfaxSettingsData>({
    carfax_location_id: "",
    city: "",
    state: "",
    postal_code: "",
    website_url: "",
    business_name: "",
    address: "",
    phone: "",
  });
  const [exports, setExports] = useState<CarfaxExportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [activating, setActivating] = useState(false);
  const [dataStats, setDataStats] = useState({ totalServices: 0, validVins: 0, missingData: 0 });

  useEffect(() => {
    const load = async () => {
      // ⚡ Parallel fetch: settings, exports, and stats all at once
      const [s, e, d] = await Promise.all([
        fetchCarfaxSettings(),
        fetchCarfaxExports(),
        fetchCarfaxDataStats(),
      ]);
      if (s) setSettings(s);
      setExports(e);
      setDataStats(d);
      setLoading(false);
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveCarfaxSettings({
        carfax_location_id: settings.carfax_location_id || null,
        city: settings.city || null,
        state: settings.state || null,
        postal_code: settings.postal_code || null,
        website_url: settings.website_url || null,
      });
      // Refresh derived carfax_activated status from the source of truth
      const fresh = await fetchCarfaxSettings();
      if (fresh) setSettings(fresh);
      toast.success("CARFAX settings saved");
    } catch {
      toast.error("Failed to save settings");
    }
    setSaving(false);
  };


  const generateExportFile = async (exportType: "PROD" | "HIST") => {
    setExporting(true);

    try {
      const services = await fetchCarfaxExportServices(exportType);

      if (!services || services.length === 0) {
        toast.error("No completed services found for export");
        setExporting(false);
        return;
      }

      const typedServices = services as unknown as CarfaxServiceExport[];
      const validServices = typedServices.filter(
        (s) => s.vehicles?.vin && s.vehicles.vin.length === 17
      );

      if (validServices.length === 0) {
        toast.error("No services with valid 17-character VINs found");
        setExporting(false);
        return;
      }

      const headers = [
        "VIN", "RO_OPEN_DATE", "RO_CLOSE_DATE", "MILEAGE", "ODOMETER_MEASURE",
        "RO_INVOICE_NUMBER", "SERVICE_DESCRIPTION", "LABOR_DESCRIPTION",
        "PART_NAME_DESCRIPTION", "PART_QUANTITY", "MAKE", "MODEL", "MODEL_YEAR",
        "PLATE", "PLATE_STATE", "MANAGEMENT_SYSTEM", "LOCATION_ID", "LOCATION_NAME",
        "ADDRESS", "CITY", "STATE", "POSTAL_CODE", "PHONE", "URL"
      ];

      const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        return `${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getDate().toString().padStart(2, "0")}/${d.getFullYear()}`;
      };

      const rows: string[][] = [];
      
      for (const service of validServices) {
        const vehicle = service.vehicles;
        const laborItems = service.labor_items || [];
        const serviceItems = service.service_items || [];
        const laborDescs = laborItems.map((l) => l.description).join("; ") || service.service_type;
        
        const baseRow = [
          vehicle.vin, formatDate(service.created_at), formatDate(service.service_date),
          Math.round(vehicle.mileage || 0).toString(), vehicle.odometer_measure || "MI",
          service.service_number || `SR-${service.id.slice(0, 8)}`,
          service.description || service.service_type, laborDescs,
        ];
        const suffixRow = [
          vehicle.make, vehicle.model, vehicle.year.toString(),
          vehicle.license_plate || "", vehicle.plate_state || "",
          "MOBILUBE_SHOP", settings.carfax_location_id || "MOBILUBE001",
          settings.business_name || "", settings.address || "",
          settings.city || "", settings.state || "",
          settings.postal_code || "", settings.phone || "", settings.website_url || "",
        ];

        if (serviceItems.length > 0) {
          for (const item of serviceItems) {
            rows.push([...baseRow, item.description, (item.quantity || 1).toString(), ...suffixRow]);
          }
        } else {
          rows.push([...baseRow, "", "", ...suffixRow]);
        }
      }

      const headerLine = headers.map(h => `"${h}"`).join("|");
      const dataLines = rows.map(row => row.map(cell => `"${(cell || "").replace(/"/g, '""')}"`).join("|"));
      const fileContent = [headerLine, ...dataLines].join("\n");

      const today = new Date();
      const dateStr = `${(today.getMonth() + 1).toString().padStart(2, "0")}${today.getDate().toString().padStart(2, "0")}${today.getFullYear()}`;
      const fileName = `MobilubeShop_${exportType}_RO_${dateStr}.txt`;

      await recordCarfaxExport(exportType, fileName, rows.length);

      const blob = new Blob([fileContent], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Exported ${rows.length} records to ${fileName}`);
      const updatedExports = await fetchCarfaxExports();
      setExports(updatedExports);
    } catch (error) {
      console.error("Export error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to generate export");
    }

    setExporting(false);
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      completed: "bg-gray-500/10 text-gray-600",
      pending: "bg-yellow-500/10 text-yellow-600",
      failed: "bg-red-500/10 text-red-600",
      uploaded: "bg-blue-500/10 text-blue-600",
    };
    return <Badge className={styles[status] || ""}>{status}</Badge>;
  };

  const isConfigComplete = settings.carfax_location_id && settings.city && settings.state && settings.postal_code;

  const handleActivate = async () => {
    if (!isConfigComplete) {
      toast.error("Please complete the required CARFAX location fields before enrolling");
      return;
    }

    setActivating(true);
    try {
      const result = await activateCarfaxShop({
        businessName: settings.business_name || settings.carfax_location_id || "Service Writer Shop",
        address: settings.address || "",
        city: settings.city,
        state: settings.state,
        zip: settings.postal_code,
        phone: settings.phone || "",
        url: settings.website_url || undefined,
        contactName: settings.business_name || "Service Writer User",
      });

      if (!result.success) {
        throw new Error("CARFAX enrollment failed");
      }

      setSettings((current) => ({
        ...current,
        carfax_location_id: result.locationId || current.carfax_location_id,
        carfax_activated: true,
        carfax_activation_date: new Date().toISOString(),
      }));
      toast.success("CARFAX enrollment activated");
    } catch (error) {
      console.error("CARFAX activation error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to activate CARFAX enrollment");
    } finally {
      setActivating(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-1/4"></div>
            <div className="h-10 bg-muted rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Export Monitoring Dashboard - Show if activated */}
      {settings.carfax_activated && <CarfaxExportMonitor />}

      {/* CARFAX Configuration Status */}
      {!settings.carfax_activated && <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <Car className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <CardTitle>CARFAX Integration</CardTitle>
                <CardDescription>Configure your CARFAX data feed settings</CardDescription>
              </div>
            </div>
            {isConfigComplete ? (
              <Badge className="bg-gray-500/10 text-gray-600 gap-1">
                <CheckCircle2 className="h-3 w-3" /> Configured
              </Badge>
            ) : (
              <Badge className="bg-yellow-500/10 text-yellow-600 gap-1">
                <AlertCircle className="h-3 w-3" /> Incomplete
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Data Readiness Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">Total Completed Services</p>
              <p className="text-2xl font-bold">{dataStats.totalServices}</p>
            </div>
            <div className="p-4 rounded-lg bg-gray-500/10">
              <p className="text-sm text-gray-600">Valid for CARFAX</p>
              <p className="text-2xl font-bold text-gray-600">{dataStats.validVins}</p>
            </div>
            <div className="p-4 rounded-lg bg-yellow-500/10">
              <p className="text-sm text-yellow-600">Missing VIN Data</p>
              <p className="text-2xl font-bold text-yellow-600">{dataStats.missingData}</p>
            </div>
          </div>

          <Separator />

          {/* Location Settings */}
          <div className="space-y-4">
            <h3 className="font-semibold">Location Information</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="carfax_location_id">CARFAX Location ID *</Label>
                <Input
                  id="carfax_location_id"
                  value={settings.carfax_location_id}
                  onChange={(e) => setSettings({ ...settings, carfax_location_id: e.target.value })}
                  placeholder="MOBILUBE001"
                  maxLength={70}
                />
                <p className="text-xs text-muted-foreground">
                  Unique identifier for your location (e.g., MOBILUBE001)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="website_url">Website URL</Label>
                <Input
                  id="website_url"
                  value={settings.website_url}
                  onChange={(e) => setSettings({ ...settings, website_url: e.target.value })}
                  placeholder="https://yourshop.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="city">City *</Label>
                <Input
                  id="city"
                  value={settings.city}
                  onChange={(e) => setSettings({ ...settings, city: e.target.value })}
                  placeholder="Springfield"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="state">State/Province *</Label>
                <Select 
                  value={settings.state} 
                  onValueChange={(v) => setSettings({ ...settings, state: v })}
                >
                  <SelectTrigger id="state">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="px-2 py-1 text-xs text-muted-foreground font-semibold">US States</div>
                    {US_STATES.map(s => (
                      <SelectItem key={s.code} value={s.code}>{s.code} - {s.name}</SelectItem>
                    ))}
                    <div className="px-2 py-1 text-xs text-muted-foreground font-semibold">Canadian Provinces</div>
                    {CANADIAN_PROVINCES.map(p => (
                      <SelectItem key={p.code} value={p.code}>{p.code} - {p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="postal_code">ZIP/Postal Code *</Label>
                <Input
                  id="postal_code"
                  value={settings.postal_code}
                  onChange={(e) => setSettings({ ...settings, postal_code: e.target.value })}
                  placeholder="22150"
                  maxLength={10}
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-4">
              {!settings.carfax_activated && (
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    onClick={handleActivate} 
                    disabled={activating || !isConfigComplete}
                    className="border-orange-200 hover:bg-orange-50 text-orange-700"
                  >
                    {activating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    Join CARFAX Service Network
                  </Button>
                  {!isConfigComplete && (
                    <p className="text-xs text-muted-foreground italic">
                      Fill in business details to unlock enrollment
                    </p>
                  )}
                </div>
              )}
              {settings.carfax_activated && (
                <div className="flex items-center gap-2 text-gray-600">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-sm font-medium">Enrolled & Active</span>
                </div>
              )}
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : "Save CARFAX Settings"}
              </Button>
            </div>
          </div>

          <Separator />

          {/* Export Section */}
          <div className="space-y-4">
            <h3 className="font-semibold">Data Export</h3>
            
            <div className="flex flex-wrap gap-3">
              <Button 
                variant="outline" 
                onClick={() => generateExportFile("PROD")} 
                disabled={exporting || !isConfigComplete}
                className="gap-2"
              >
                <Download className="h-4 w-4" />
                Export Today's Data (PROD)
              </Button>
              <Button 
                variant="outline" 
                onClick={() => generateExportFile("HIST")} 
                disabled={exporting || !isConfigComplete}
                className="gap-2"
              >
                <FileText className="h-4 w-4" />
                Export All History (HIST)
              </Button>
            </div>

            {!isConfigComplete && (
              <p className="text-sm text-yellow-600">
                Please complete all required location fields before exporting.
              </p>
            )}

            {/* Export History */}
            {exports.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium mb-2">Recent Exports</h4>
                <div className="space-y-2">
                  {exports.map((exp) => (
                    <div key={exp.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{exp.file_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {exp.record_count} records • {new Date(exp.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      {getStatusBadge(exp.status)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Help Links */}
          <div className="space-y-2">
            <h3 className="font-semibold">Resources</h3>
            <div className="flex flex-wrap gap-3">
              <Button variant="link" className="h-auto p-0 gap-1" asChild>
                <a href="/docs/carfax/CARFAX_Integration_Guide.md" target="_blank">
                  <ExternalLink className="h-3 w-3" /> Integration Guide
                </a>
              </Button>
              <Button variant="link" className="h-auto p-0 gap-1" asChild>
                <a href="mailto:DataServicesmycarfaxserviceshop@carfax.com">
                  <ExternalLink className="h-3 w-3" /> Contact CARFAX Support
                </a>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>}
    </div>
  );
}

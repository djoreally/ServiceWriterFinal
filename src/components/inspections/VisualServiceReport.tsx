import { useState, useEffect, useRef } from "react";
import { fetchInspectionReport, type InspectionReportData, type InspectionResultRow as InspResultRow, type InspectionVehicle as VehicleD, type InspectionBusiness as BusinessD } from "@/application/queries/visual-inspection.query";
import { useAuth } from "@packages/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Minus,
  Printer,
  Share2,
  Mail,
  FileText,
  Car,
  Wrench,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ProgressiveImage } from "@/components/media/ProgressiveImage";

interface InspectionResultRow {
  id: string;
  item_name: string;
  item_category: string | null;
  status: string;
  notes: string | null;
  image_url: string | null;
  sort_order: number;
  severity: string | null;
  measurement: string | null;
}

interface InspectionData {
  id: string;
  template_name: string;
  inspector_name: string | null;
  inspection_date: string;
  notes: string | null;
  status: string;
  audio_url: string | null;
  transcript: string | null;
  source: string | null;
}

interface VehicleData {
  year: number | null;
  make: string | null;
  model: string | null;
  vin: string | null;
  license_plate: string | null;
  color: string | null;
  mileage: number | null;
}

interface BusinessData {
  business_name: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  service_address: string | null;
}

interface VisualServiceReportProps {
  inspectionId: string;
  onClose?: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; icon: typeof CheckCircle2; color: string; bgColor: string; borderColor: string }> = {
  pass: { label: "Good", icon: CheckCircle2, color: "text-gray-600", bgColor: "bg-green-50 dark:bg-green-950", borderColor: "border-gray-200 dark:border-green-800" },
  fail: { label: "Needs Repair", icon: XCircle, color: "text-red-600", bgColor: "bg-red-50 dark:bg-red-950", borderColor: "border-red-200 dark:border-red-800" },
  warning: { label: "Monitor", icon: AlertTriangle, color: "text-yellow-600", bgColor: "bg-yellow-50 dark:bg-yellow-950", borderColor: "border-yellow-200 dark:border-yellow-800" },
  not_applicable: { label: "N/A", icon: Minus, color: "text-muted-foreground", bgColor: "bg-muted", borderColor: "border-border" },
};

const SEVERITY_COLORS: Record<string, string> = {
  good: "bg-gray-500",
  attention: "bg-yellow-500",
  urgent: "bg-red-500",
};

const CATEGORY_ICONS: Record<string, string> = {
  engine: "🔧",
  brakes: "🛑",
  suspension: "🔩",
  fluids: "💧",
  electrical: "⚡",
  exterior: "🚗",
  interior: "💺",
  tires: "🛞",
  exhaust: "💨",
  drivetrain: "⚙️",
  steering: "🎯",
  other: "📋",
};

/**
 * Customer-facing visual inspection report.
 * Shows color-coded findings with photos, measurements, and severity.
 * Can be printed, emailed, or shared.
 */
export function VisualServiceReport({ inspectionId, onClose }: VisualServiceReportProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [inspection, setInspection] = useState<InspectionData | null>(null);
  const [results, setResults] = useState<InspectionResultRow[]>([]);
  const [vehicle, setVehicle] = useState<VehicleData | null>(null);
  const [business, setBusiness] = useState<BusinessData | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchData();
  }, [inspectionId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const report = await fetchInspectionReport(inspectionId);
      setInspection(report.inspection as unknown as InspectionData);
      setResults(report.results as unknown as InspectionResultRow[]);
      setVehicle(report.vehicle as unknown as VehicleData);
      setBusiness(report.business as unknown as BusinessData);
    } catch (err) {
      console.error("Failed to load inspection:", err);
      toast.error("Failed to load inspection report");
    }
    setLoading(false);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleEmail = async () => {
    const vehicleLabel = vehicle ? `${vehicle.year ?? ""} ${vehicle.make ?? ""} ${vehicle.model ?? ""}`.trim() : "vehicle";
    const subject = encodeURIComponent(`Inspection Report - ${vehicleLabel}`);
    const body = encodeURIComponent(
      [
        "Hello,",
        "",
        `Please find the inspection report here: ${window.location.href}`,
        "",
        `Inspection date: ${inspection?.inspection_date ?? "N/A"}`,
        `Business: ${business?.business_name ?? "N/A"}`,
      ].join("\n")
    );

    const recipient = business?.email || "";
    const mailto = `mailto:${recipient}?subject=${subject}&body=${body}`;
    window.location.href = mailto;
    toast.success("Email draft opened");
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Vehicle Inspection Report`,
          text: `Inspection report for ${vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "your vehicle"}`,
          url: window.location.href,
        });
      } catch {
        // User cancelled
      }
    } else {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied to clipboard");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!inspection) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Inspection report not found.
        </CardContent>
      </Card>
    );
  }

  // Group results by category
  const categoryGroups = results.reduce<Record<string, InspectionResultRow[]>>((acc, r) => {
    const cat = r.item_category || "other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(r);
    return acc;
  }, {});

  const passCount = results.filter((r) => r.status === "pass").length;
  const warnCount = results.filter((r) => r.status === "warning").length;
  const failCount = results.filter((r) => r.status === "fail").length;
  const totalChecked = results.filter((r) => r.status !== "not_applicable").length;

  // Overall health score
  const healthScore = totalChecked > 0 ? Math.round((passCount / totalChecked) * 100) : 100;
  const healthColor =
    healthScore >= 80 ? "text-gray-600" : healthScore >= 50 ? "text-yellow-600" : "text-red-600";

  return (
    <div className="space-y-4">
      {/* Action bar (non-printable) */}
      <div className="flex items-center justify-between print:hidden">
        {onClose && (
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        )}
        <div className="flex gap-2 ml-auto">
          <Button variant="outline" size="sm" onClick={handleShare} className="gap-1">
            <Share2 className="h-4 w-4" />
            Share
          </Button>
          <Button variant="outline" size="sm" onClick={handleEmail} className="gap-1">
            <Mail className="h-4 w-4" />
            Email
          </Button>
          <Button size="sm" onClick={handlePrint} className="gap-1">
            <Printer className="h-4 w-4" />
            Print
          </Button>
        </div>
      </div>

      {/* Printable report */}
      <div ref={printRef} className="space-y-4 print:space-y-3">
        {/* Header with business branding */}
        <Card className="overflow-hidden">
          <div className="bg-primary text-primary-foreground p-6 print:p-4">
            <div className="flex items-center justify-between">
              <div>
                {business?.logo_url && (
                  <ProgressiveImage
                    src={business.logo_url}
                    alt={business.business_name || ""}
                    className="h-10 mb-2 object-contain brightness-0 invert"
                    placeholderClassName="h-10 w-10 mb-2"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                )}
                <h1 className="text-xl font-bold">
                  {business?.business_name || "Vehicle Inspection Report"}
                </h1>
                {business?.service_address && (
                  <p className="text-sm opacity-80 mt-1">{business.service_address}</p>
                )}
                {business?.phone && (
                  <p className="text-sm opacity-80">{business.phone}</p>
                )}
              </div>
              <div className="text-right">
                <FileText className="h-8 w-8 opacity-50 mb-1 ml-auto" />
                <p className="text-sm font-medium">INSPECTION REPORT</p>
                <p className="text-xs opacity-80">{inspection.inspection_date}</p>
              </div>
            </div>
          </div>

          {/* Vehicle info bar */}
          {vehicle && (
            <div className="bg-muted px-6 py-3 flex items-center gap-4 flex-wrap print:px-4">
              <div className="flex items-center gap-2">
                <Car className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">
                  {vehicle.year} {vehicle.make} {vehicle.model}
                </span>
              </div>
              {vehicle.color && (
                <span className="text-sm text-muted-foreground">Color: {vehicle.color}</span>
              )}
              {vehicle.mileage && (
                <span className="text-sm text-muted-foreground">
                  Mileage: {vehicle.mileage.toLocaleString()}
                </span>
              )}
              {vehicle.vin && (
                <span className="text-xs text-muted-foreground font-mono">VIN: {vehicle.vin}</span>
              )}
            </div>
          )}
        </Card>

        {/* Health score + summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Card className="sm:col-span-1">
            <CardContent className="py-4 text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Health Score</p>
              <p className={cn("text-4xl font-bold mt-1", healthColor)}>{healthScore}%</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Passed</p>
              <p className="text-2xl font-bold text-gray-600 mt-1">{passCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Monitor</p>
              <p className="text-2xl font-bold text-yellow-600 mt-1">{warnCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Needs Repair</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{failCount}</p>
            </CardContent>
          </Card>
        </div>

        {/* Inspector note / AI summary */}
        {inspection.notes && (
          <Card>
            <CardContent className="py-3 px-4">
              <p className="text-sm font-medium mb-1">Inspector Summary</p>
              <p className="text-sm text-muted-foreground">{inspection.notes}</p>
              {inspection.inspector_name && (
                <p className="text-xs text-muted-foreground mt-2">
                  — {inspection.inspector_name}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Findings by category */}
        {Object.entries(categoryGroups).map(([category, items]) => (
          <Card key={category}>
            <CardHeader className="py-3 px-4 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 capitalize">
                <span>{CATEGORY_ICONS[category] || "📋"}</span>
                {category}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-2">
              {items.map((result) => {
                const cfg = STATUS_CONFIG[result.status] || STATUS_CONFIG.not_applicable;
                const Icon = cfg.icon;

                return (
                  <div
                    key={result.id}
                    className={cn(
                      "rounded-lg border p-3 flex gap-3",
                      cfg.bgColor,
                      cfg.borderColor
                    )}
                  >
                    {/* Status icon */}
                    <Icon className={cn("h-5 w-5 mt-0.5 shrink-0", cfg.color)} />

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{result.item_name}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {cfg.label}
                        </Badge>
                        {result.severity && (
                          <div className="flex items-center gap-1">
                            <div className={cn("h-2 w-2 rounded-md", SEVERITY_COLORS[result.severity] || "")} />
                            <span className="text-[10px] text-muted-foreground capitalize">
                              {result.severity}
                            </span>
                          </div>
                        )}
                        {result.measurement && (
                          <Badge variant="secondary" className="text-[10px]">
                            {result.measurement}
                          </Badge>
                        )}
                      </div>
                      {result.notes && (
                        <p className="text-xs text-muted-foreground mt-1">{result.notes}</p>
                      )}
                    </div>

                    {/* Photo thumbnail */}
                    {result.image_url && (
                      <ProgressiveImage
                        src={result.image_url}
                        alt={result.item_name}
                        className="h-16 w-16 object-cover rounded-md border shrink-0"
                        placeholderClassName="h-16 w-16 rounded-md shrink-0"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      />
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}

        {/* No results */}
        {results.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No inspection findings recorded.
            </CardContent>
          </Card>
        )}

        {/* Voice badge if applicable */}
        {inspection.source === "voice" && (
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground print:hidden">
            <Wrench className="h-3 w-3" />
            AI-assisted voice inspection report
          </div>
        )}

        {/* Footer */}
        <Separator />
        <div className="text-center text-xs text-muted-foreground pb-4">
          <p>This report was generated on {new Date(inspection.inspection_date).toLocaleDateString()}</p>
          {business?.business_name && <p>by {business.business_name}</p>}
          <p className="mt-1 opacity-60">Powered by ServiceWriter</p>
        </div>
      </div>
    </div>
  );
}

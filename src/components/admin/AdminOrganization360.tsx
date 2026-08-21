import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CircleDollarSign } from "lucide-react";
import { fetchOrganization360Profiles, type Organization360Profile } from "@/application/queries/admin-organization-360.query";
import { formatCentsAsCurrency } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const featureLabels: Array<[keyof Organization360Profile["featureUsage"], string]> = [
  ["appointments", "Appointments"],
  ["customers", "Customers"],
  ["inventory", "Inventory"],
  ["reports", "Reports"],
  ["newsletter", "Newsletter"],
  ["marketplace", "Marketplace"],
];

function riskVariant(risk: Organization360Profile["risk"]): "default" | "secondary" | "destructive" {
  if (risk === "Low") return "default";
  if (risk === "Medium") return "secondary";
  return "destructive";
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

export function AdminOrganization360() {
  const [profiles, setProfiles] = useState<Organization360Profile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOrganization360Profiles()
      .then((data) => {
        setProfiles(data);
        setSelectedId(data[0]?.organizationId ?? null);
      })
      .catch((err) => {
        console.error("Failed to load Organization 360 profiles:", err);
        setError("Unable to load organization health profiles.");
      })
      .finally(() => setLoading(false));
  }, []);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.organizationId === selectedId) ?? profiles[0] ?? null,
    [profiles, selectedId],
  );

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">Loading Organization 360…</CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-6 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </CardContent>
      </Card>
    );
  }

  if (!selectedProfile) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">No organizations found.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Organization 360</h2>
          <p className="text-muted-foreground">One screen. One customer. Everything support needs.</p>
        </div>
        <Select value={selectedProfile.organizationId} onValueChange={setSelectedId}>
          <SelectTrigger className="w-full md:w-[320px]">
            <SelectValue placeholder="Select organization" />
          </SelectTrigger>
          <SelectContent>
            {profiles.map((profile) => (
              <SelectItem key={profile.organizationId} value={profile.organizationId}>
                {profile.organizationName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="text-3xl">{selectedProfile.organizationName}</CardTitle>
            <CardDescription>Plan: {selectedProfile.planName}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={riskVariant(selectedProfile.risk)}>Risk: {selectedProfile.risk}</Badge>
            <Badge variant="outline">Health Score: {selectedProfile.healthScore}/100</Badge>
            <Badge variant="outline">Last Active: {selectedProfile.lastActiveLabel}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatTile label="MRR" value={formatCentsAsCurrency(selectedProfile.mrrCents)} />
            <StatTile label="Days Active" value={selectedProfile.daysActive.toLocaleString()} />
            <StatTile label="Employees" value={selectedProfile.employeeCount.toLocaleString()} />
            <StatTile label="Customers" value={selectedProfile.customerCount.toLocaleString()} />
            <StatTile label="Vehicles" value={selectedProfile.vehicleCount.toLocaleString()} />
            <StatTile label="Appointments" value={selectedProfile.appointmentCount.toLocaleString()} />
            <StatTile label="Completed" value={selectedProfile.completedAppointmentCount.toLocaleString()} />
            <StatTile label="Revenue" value={formatCentsAsCurrency(selectedProfile.revenueCents)} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg">Feature Usage</CardTitle>
                <CardDescription>Major module adoption for this organization.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {featureLabels.map(([key, label]) => {
                  const enabled = selectedProfile.featureUsage[key];
                  return (
                    <div key={key} className="flex items-center justify-between rounded-md border p-3">
                      <span className="font-medium">{label}</span>
                      <span
                        className={enabled ? "text-xl text-emerald-600" : "text-xl text-muted-foreground"}
                        aria-label={`${label} ${enabled ? "used" : "not used"}`}
                      >
                        {enabled ? "✅" : "❌"}
                      </span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CircleDollarSign className="h-5 w-5 text-emerald-600" />
                  Account Health
                </CardTitle>
                <CardDescription>Support-ready health signals.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <StatTile label="First Value" value={selectedProfile.firstValueLabel} />
                <StatTile label="Retention" value={`${selectedProfile.retentionRate}%`} />
                <StatTile label="Health Score" value={`${selectedProfile.healthScore}/100`} />
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

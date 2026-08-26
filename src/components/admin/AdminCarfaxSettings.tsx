import { useState, useEffect, useCallback } from "react";
import {
  fetchAdminCarfaxSettings,
  fetchCarfaxExportStats,
  type CarfaxConfig,
} from "@/application/queries/admin-carfax.query";
import { saveAdminCarfaxSettings } from "@/application/commands/admin-carfax.command";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { 
  Car, 
  CheckCircle2, 
  AlertCircle, 
  Save, 
  Loader2,
  FileText,
  Download,
  Settings
} from "lucide-react";
import { toast } from "@/components/ui/sonner";

export function AdminCarfaxSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<CarfaxConfig>({
    enabled: false,
    location_id: "",
    api_configured: false,
    business_name: "",
    address: "",
    city: "",
    state: "",
    postal_code: "",
    phone: "",
    website_url: "",
  });
  const [exportStats, setExportStats] = useState({ total: 0, lastExport: null as string | null });

  const fetchSettings = useCallback(async () => {
    const configData = await fetchAdminCarfaxSettings();
    if (configData) {
      setConfig(prevConfig => ({ ...prevConfig, ...configData }));
    }
    setLoading(false);
  }, []);

  const fetchStats = useCallback(async () => {
    const stats = await fetchCarfaxExportStats();
    setExportStats(stats);
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchStats();
  }, [fetchSettings, fetchStats]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveAdminCarfaxSettings(config);
      toast.success("CARFAX settings saved");
    } catch {
      toast.error("Failed to save CARFAX settings");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status Overview */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <Car className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <CardTitle>CARFAX Integration</CardTitle>
                <CardDescription>Platform-wide CARFAX data feed configuration</CardDescription>
              </div>
            </div>
            {config.enabled ? (
              <Badge className="bg-gray-500/10 text-gray-600 gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Enabled
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1">
                <AlertCircle className="h-3 w-3" />
                Disabled
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Enable Toggle */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
            <div>
              <p className="font-medium">Enable CARFAX Integration</p>
              <p className="text-sm text-muted-foreground">
                Allow the platform to submit service data to CARFAX
              </p>
            </div>
            <Switch
              checked={config.enabled}
              onCheckedChange={(checked) => setConfig({ ...config, enabled: checked })}
            />
          </div>

          {/* API Status */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">API Status</p>
              <div className="flex items-center gap-2 mt-1">
                {config.api_configured ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-gray-600" />
                    <span className="font-medium text-gray-600">Configured</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4 text-yellow-600" />
                    <span className="font-medium text-yellow-600">Not Configured</span>
                  </>
                )}
              </div>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">Total Exports</p>
              <p className="text-2xl font-bold">{exportStats.total}</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">Last Export</p>
              <p className="font-medium">
                {exportStats.lastExport 
                  ? new Date(exportStats.lastExport).toLocaleDateString() 
                  : "Never"}
              </p>
            </div>
          </div>

          <Separator />

          {/* Location Settings */}
          <div className="space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Settings className="h-4 w-4" />
              CARFAX Location Settings
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>CARFAX Location ID</Label>
                <Input
                  value={config.location_id}
                  onChange={(e) => setConfig({ ...config, location_id: e.target.value })}
                  placeholder="WHH001"
                />
                <p className="text-xs text-muted-foreground">
                  Your unique identifier assigned by CARFAX
                </p>
              </div>
              <div className="space-y-2">
                <Label>Business Name</Label>
                <Input
                  value={config.business_name || ""}
                  onChange={(e) => setConfig({ ...config, business_name: e.target.value })}
                  placeholder="Auto Shop Platform"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Address</Label>
                <Input
                  value={config.address || ""}
                  onChange={(e) => setConfig({ ...config, address: e.target.value })}
                  placeholder="123 Main Street"
                />
              </div>
              <div className="space-y-2">
                <Label>City</Label>
                <Input
                  value={config.city || ""}
                  onChange={(e) => setConfig({ ...config, city: e.target.value })}
                  placeholder="City"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>State</Label>
                <Input
                  value={config.state || ""}
                  onChange={(e) => setConfig({ ...config, state: e.target.value })}
                  placeholder="CA"
                  maxLength={2}
                />
              </div>
              <div className="space-y-2">
                <Label>Postal Code</Label>
                <Input
                  value={config.postal_code || ""}
                  onChange={(e) => setConfig({ ...config, postal_code: e.target.value })}
                  placeholder="12345"
                />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={config.phone || ""}
                  onChange={(e) => setConfig({ ...config, phone: e.target.value })}
                  placeholder="(555) 123-4567"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Website URL</Label>
              <Input
                value={config.website_url || ""}
                onChange={(e) => setConfig({ ...config, website_url: e.target.value })}
                placeholder="https://example.com"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Settings
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* API Credentials Note */}
      <Card className="border-yellow-500/30 bg-yellow-500/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div>
              <p className="font-medium text-yellow-600">API Credentials Required</p>
              <p className="text-sm text-muted-foreground mt-1">
                CARFAX API credentials (CARFAX_API_KEY and CARFAX_ACCOUNT_ID) must be configured as 
                platform secrets to enable live data submissions. Contact CARFAX to obtain your credentials.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

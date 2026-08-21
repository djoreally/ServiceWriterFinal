/**
 * TaxSettings - Location-Based Taxation Configuration
 * 
 * Allows businesses to configure tax rates by state/jurisdiction
 * instead of a single flat rate.
 */

import { useState, useEffect } from "react";
import {
  fetchTaxSettings,
  type TaxRate,
  type TaxSettingsData,
} from "@/application/queries/tax-settings.query";
import {
  saveTaxSettings as saveTaxSettingsApi,
  seedDefaultTaxRates,
  saveTaxRate as saveTaxRateApi,
  deleteTaxRate as deleteTaxRateApi,
} from "@/application/commands/tax-settings.command";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  MapPin,
  Plus,
  Trash2,
  Edit2,
  Save,
  Loader2,
  Receipt,
  Globe,
  Download,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { bankersRound } from "@/lib/financialMath";

// US State codes and names
const US_STATES = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
];

// States with no sales tax
const NO_TAX_STATES = ["AK", "DE", "MT", "NH", "OR"];

// Types imported from application layer

export const TaxSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [settings, setSettings] = useState<TaxSettingsData>({
    location_tax_enabled: false,
    tax_provider: "manual",
    default_tax_nexus_state: null,
    flat_tax_rate: 0,
  });
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRate, setEditingRate] = useState<TaxRate | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [rateToDelete, setRateToDelete] = useState<TaxRate | null>(null);
  const [rateForm, setRateForm] = useState({
    state_code: "",
    county: "",
    city: "",
    postal_code: "",
    state_rate: 0,
    county_rate: 0,
    city_rate: 0,
    special_rate: 0,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { settings: s, rates } = await fetchTaxSettings();
      setSettings(s);
      setTaxRates(rates);
    } catch (e) {
      console.error("Error fetching tax data:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await saveTaxSettingsApi(settings);
      toast.success("Tax settings saved");
    } catch {
      toast.error("Failed to save tax settings");
    }
    setSaving(false);
  };

  const handleSeedDefaultRates = async () => {
    setSeeding(true);
    try {
      await seedDefaultTaxRates();
      toast.success("Default state tax rates added");
      fetchData();
    } catch {
      toast.error("Failed to seed default rates");
    }
    setSeeding(false);
  };

  const calculateCombinedRate = () => {
    return bankersRound((
      Number(rateForm.state_rate) +
      Number(rateForm.county_rate) +
      Number(rateForm.city_rate) +
      Number(rateForm.special_rate)
    ), 3);
  };

  const handleSaveRate = async () => {
    if (!rateForm.state_code) {
      toast.error("Please select a state");
      return;
    }

    try {
      await saveTaxRateApi({
        state_code: rateForm.state_code,
        county: rateForm.county || null,
        city: rateForm.city || null,
        postal_code: rateForm.postal_code || null,
        state_rate: Number(rateForm.state_rate) / 100,
        county_rate: Number(rateForm.county_rate) / 100,
        city_rate: Number(rateForm.city_rate) / 100,
        special_rate: Number(rateForm.special_rate) / 100,
        combined_rate: calculateCombinedRate() / 100,
      }, editingRate?.id);

      toast.success(editingRate ? "Tax rate updated" : "Tax rate added");
      setDialogOpen(false);
      fetchData();
    } catch (error: any) {
      if (error?.code === "23505") {
        toast.error("A rate for this jurisdiction already exists");
      } else {
        toast.error(editingRate ? "Failed to update tax rate" : "Failed to add tax rate");
      }
    }

    resetForm();
  };

  const handleDeleteRate = async () => {
    if (!rateToDelete) return;

    try {
      await deleteTaxRateApi(rateToDelete.id);
      toast.success("Tax rate deleted");
      fetchData();
    } catch {
      toast.error("Failed to delete tax rate");
    }
    setDeleteDialogOpen(false);
    setRateToDelete(null);
  };

  const resetForm = () => {
    setRateForm({
      state_code: "",
      county: "",
      city: "",
      postal_code: "",
      state_rate: 0,
      county_rate: 0,
      city_rate: 0,
      special_rate: 0,
    });
    setEditingRate(null);
  };

  const openEditDialog = (rate: TaxRate) => {
    setEditingRate(rate);
    setRateForm({
      state_code: rate.state_code,
      county: rate.county || "",
      city: rate.city || "",
      postal_code: rate.postal_code || "",
      state_rate: rate.state_rate * 100,
      county_rate: rate.county_rate * 100,
      city_rate: rate.city_rate * 100,
      special_rate: rate.special_rate * 100,
    });
    setDialogOpen(true);
  };

  const formatRate = (rate: number) => {
    return `${new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    }).format(bankersRound(rate * 100, 3))}%`;
  };

  const getStateName = (code: string) => {
    return US_STATES.find(s => s.code === code)?.name || code;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Main Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Location-Based Taxation
          </CardTitle>
          <CardDescription>
            Configure tax rates by state and jurisdiction instead of a single flat rate
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Enable Location-Based Tax</Label>
              <p className="text-sm text-muted-foreground">
                Calculate tax based on customer location
              </p>
            </div>
            <Switch
              checked={settings.location_tax_enabled}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, location_tax_enabled: checked })
              }
            />
          </div>

          {!settings.location_tax_enabled && (
            <>
              <Separator />
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Flat Tax Rate</Label>
                    <p className="text-sm text-muted-foreground">
                      Applied to all transactions
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={settings.flat_tax_rate}
                      onChange={(e) =>
                        setSettings({ ...settings, flat_tax_rate: Number(e.target.value) || 0 })
                      }
                      className="w-24 text-right"
                      min={0}
                      max={30}
                      step={0.01}
                    />
                    <span className="text-muted-foreground">%</span>
                  </div>
                </div>
              </div>
            </>
          )}

          {settings.location_tax_enabled && (
            <>
              <Separator />

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Default Nexus State</Label>
                  <Select
                    value={settings.default_tax_nexus_state || ""}
                    onValueChange={(value) =>
                      setSettings({ ...settings, default_tax_nexus_state: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select your primary state" />
                    </SelectTrigger>
                    <SelectContent>
                      {US_STATES.map((state) => (
                        <SelectItem key={state.code} value={state.code}>
                          {state.name} ({state.code})
                          {NO_TAX_STATES.includes(state.code) && (
                            <span className="ml-2 text-xs text-muted-foreground">(No sales tax)</span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Your home state where you have tax nexus
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Tax Calculation Method</Label>
                  <Select
                    value={settings.tax_provider}
                    onValueChange={(value) =>
                      setSettings({ ...settings, tax_provider: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual - Use configured rates</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}

          <Button onClick={handleSaveSettings} disabled={saving} className="w-full">
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Tax Settings
          </Button>
        </CardContent>
      </Card>

      {/* Tax Rates Table - Only show when location-based is enabled */}
      {settings.location_tax_enabled && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  Tax Rates by Jurisdiction
                </CardTitle>
                <CardDescription>
                  Configure specific tax rates for different states and localities
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSeedDefaultRates}
                  disabled={seeding}
                >
                  {seeding ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  Load Default Rates
                </Button>
                <Dialog open={dialogOpen} onOpenChange={(open) => {
                  setDialogOpen(open);
                  if (!open) resetForm();
                }}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Rate
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>
                        {editingRate ? "Edit Tax Rate" : "Add Tax Rate"}
                      </DialogTitle>
                      <DialogDescription>
                        Configure tax rates for a specific jurisdiction
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div className="space-y-2">
                        <Label>State *</Label>
                        <Select
                          value={rateForm.state_code}
                          onValueChange={(value) =>
                            setRateForm({ ...rateForm, state_code: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select state" />
                          </SelectTrigger>
                          <SelectContent>
                            {US_STATES.map((state) => (
                              <SelectItem key={state.code} value={state.code}>
                                {state.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>County (Optional)</Label>
                          <Input
                            value={rateForm.county}
                            onChange={(e) =>
                              setRateForm({ ...rateForm, county: e.target.value })
                            }
                            placeholder="e.g., Los Angeles"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>City (Optional)</Label>
                          <Input
                            value={rateForm.city}
                            onChange={(e) =>
                              setRateForm({ ...rateForm, city: e.target.value })
                            }
                            placeholder="e.g., Santa Monica"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Postal Code (Optional)</Label>
                        <Input
                          value={rateForm.postal_code}
                          onChange={(e) =>
                            setRateForm({ ...rateForm, postal_code: e.target.value })
                          }
                          placeholder="e.g., 90210"
                        />
                      </div>

                      <Separator />

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>State Rate (%)</Label>
                          <Input
                            type="number"
                            value={rateForm.state_rate}
                            onChange={(e) =>
                              setRateForm({ ...rateForm, state_rate: Number(e.target.value) || 0 })
                            }
                            min={0}
                            max={15}
                            step={0.001}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>County Rate (%)</Label>
                          <Input
                            type="number"
                            value={rateForm.county_rate}
                            onChange={(e) =>
                              setRateForm({ ...rateForm, county_rate: Number(e.target.value) || 0 })
                            }
                            min={0}
                            max={10}
                            step={0.001}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>City Rate (%)</Label>
                          <Input
                            type="number"
                            value={rateForm.city_rate}
                            onChange={(e) =>
                              setRateForm({ ...rateForm, city_rate: Number(e.target.value) || 0 })
                            }
                            min={0}
                            max={10}
                            step={0.001}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Special District (%)</Label>
                          <Input
                            type="number"
                            value={rateForm.special_rate}
                            onChange={(e) =>
                              setRateForm({ ...rateForm, special_rate: Number(e.target.value) || 0 })
                            }
                            min={0}
                            max={5}
                            step={0.001}
                          />
                        </div>
                      </div>

                      <div className="p-4 bg-muted/50 rounded-lg">
                        <div className="flex justify-between items-center">
                          <span className="font-medium">Combined Rate:</span>
                          <span className="text-xl font-bold text-primary">
                            {new Intl.NumberFormat("en-US", {
                              minimumFractionDigits: 3,
                              maximumFractionDigits: 3,
                            }).format(calculateCombinedRate())}%
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-3 pt-2">
                        <Button
                          variant="outline"
                          onClick={() => setDialogOpen(false)}
                          className="flex-1"
                        >
                          Cancel
                        </Button>
                        <Button onClick={handleSaveRate} className="flex-1">
                          {editingRate ? "Update" : "Add"} Rate
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {taxRates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Receipt className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No tax rates configured</p>
                <p className="text-sm">
                  Click "Load Default Rates" to add US state rates, or add rates manually.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Jurisdiction</TableHead>
                    <TableHead className="text-right">State</TableHead>
                    <TableHead className="text-right">County</TableHead>
                    <TableHead className="text-right">City</TableHead>
                    <TableHead className="text-right">Special</TableHead>
                    <TableHead className="text-right">Combined</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {taxRates.map((rate) => (
                    <TableRow key={rate.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{getStateName(rate.state_code)}</span>
                          {rate.county && (
                            <Badge variant="outline" className="text-xs">
                              {rate.county}
                            </Badge>
                          )}
                          {rate.city && (
                            <Badge variant="secondary" className="text-xs">
                              {rate.city}
                            </Badge>
                          )}
                          {rate.postal_code && (
                            <span className="text-xs text-muted-foreground">
                              ({rate.postal_code})
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatRate(rate.state_rate)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatRate(rate.county_rate)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatRate(rate.city_rate)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatRate(rate.special_rate)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-primary">
                        {formatRate(rate.combined_rate)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(rate)}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setRateToDelete(rate);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Warning Notice */}
      <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Tax Compliance Notice
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Tax rates vary by jurisdiction and change frequently. Always verify rates with your 
                state/local tax authority. This tool is for convenience only and does not constitute 
                tax advice. Consult a tax professional for compliance requirements.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tax Rate</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this tax rate? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteRate} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

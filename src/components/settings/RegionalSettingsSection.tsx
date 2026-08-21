/**
 * RegionalSettingsSection - Date format, timezone, and currency settings
 */

import { Globe } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CURRENCIES, TIMEZONES } from "@/contexts/RegionalSettingsContext";

interface RegionalSettingsData {
  date_format: string;
  timezone: string;
  currency: string;
}

interface RegionalSettingsSectionProps {
  settings: RegionalSettingsData;
  onSettingsChange: (updates: Partial<RegionalSettingsData>) => void;
}

export function RegionalSettingsSection({ settings, onSettingsChange }: RegionalSettingsSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5" />
          Regional Settings
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Configure date format, timezone, and currency for your business
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="date_format">Date & Time Format</Label>
            <Select
              value={settings.date_format}
              onValueChange={(value) => onSettingsChange({ date_format: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DD/MM/YYYY HH:mm">DD/MM/YYYY HH:MM (24h)</SelectItem>
                <SelectItem value="MM/DD/YYYY hh:mm A">MM/DD/YYYY HH:MM AM/PM</SelectItem>
                <SelectItem value="YYYY-MM-DD HH:mm">YYYY-MM-DD HH:MM (ISO)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">How dates appear throughout the app</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Select
              value={settings.timezone}
              onValueChange={(value) => onSettingsChange({ timezone: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map(tz => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label} ({tz.offset})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Your business timezone</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="currency">Currency</Label>
            <Select
              value="USD"
              onValueChange={() => onSettingsChange({ currency: "USD" })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select currency" />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.filter((c) => c.code === "USD").map(c => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.code} ({c.symbol}) - {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Currency for prices and invoices</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * WeatherGuardSettings — Admin settings card for Weather Guard
 *
 * Allows shop owners to enable/disable weather-based blocking
 * and configure which weather conditions should block booking slots.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { CloudRain, Snowflake, Wind, CloudLightning, CloudDrizzle, CloudFog, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  parseWeatherGuardSettings,
  type WeatherGuardSettings as WGSettings,
} from "@/lib/weather-guard";
import type { Json } from "@/integrations/supabase/types";

interface WeatherGuardSettingsProps {
  enabled: boolean;
  settings: Json | null;
  hasCoordinates: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onSettingsChange: (settings: WGSettings) => void;
}

export function WeatherGuardSettings({
  enabled,
  settings,
  hasCoordinates,
  onEnabledChange,
  onSettingsChange,
}: WeatherGuardSettingsProps) {
  const parsed = parseWeatherGuardSettings(settings);

  const updateSetting = <K extends keyof WGSettings>(key: K, value: WGSettings[K]) => {
    onSettingsChange({ ...parsed, [key]: value });
  };

  const activeCount = [
    parsed.block_rain,
    parsed.block_snow,
    parsed.block_wind,
    parsed.block_thunderstorms,
    parsed.block_freezing_rain,
    parsed.block_fog,
  ].filter(Boolean).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" />
            Weather Guard
            {enabled && activeCount > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">
                {activeCount} condition{activeCount !== 1 ? "s" : ""} active
              </Badge>
            )}
          </CardTitle>
          <Switch
            checked={enabled}
            onCheckedChange={onEnabledChange}
            disabled={!hasCoordinates}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Automatically block booking time slots when adverse weather is forecasted at your business location.
        </p>
        {!hasCoordinates && (
          <p className="text-sm text-destructive mt-1">
            Verify your business address above to enable Weather Guard — coordinates are required for weather forecasts.
          </p>
        )}
      </CardHeader>

      {enabled && hasCoordinates && (
        <CardContent className="space-y-6">
          {/* Rain */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CloudRain className="h-5 w-5 text-blue-500" />
              <div>
                <Label className="font-medium">Block Rainy Days</Label>
                <p className="text-xs text-muted-foreground">
                  Drizzle, rain, rain showers
                </p>
              </div>
            </div>
            <Switch
              checked={parsed.block_rain}
              onCheckedChange={(v) => updateSetting("block_rain", v)}
            />
          </div>

          {/* Snow */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Snowflake className="h-5 w-5 text-cyan-400" />
              <div>
                <Label className="font-medium">Block Snowy Days</Label>
                <p className="text-xs text-muted-foreground">
                  Snowfall, snow grains, snow showers
                </p>
              </div>
            </div>
            <Switch
              checked={parsed.block_snow}
              onCheckedChange={(v) => updateSetting("block_snow", v)}
            />
          </div>

          {/* Wind */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Wind className="h-5 w-5 text-gray-500" />
                <div>
                  <Label className="font-medium">Block Windy Days</Label>
                  <p className="text-xs text-muted-foreground">
                    Block when wind exceeds threshold
                  </p>
                </div>
              </div>
              <Switch
                checked={parsed.block_wind}
                onCheckedChange={(v) => updateSetting("block_wind", v)}
              />
            </div>
            {parsed.block_wind && (
              <div className="ml-8 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Wind Speed Threshold</Label>
                  <span className="text-sm font-semibold text-primary">
                    {parsed.wind_speed_threshold_mph} mph
                  </span>
                </div>
                <Slider
                  min={10}
                  max={60}
                  step={5}
                  value={[parsed.wind_speed_threshold_mph]}
                  onValueChange={([v]) => updateSetting("wind_speed_threshold_mph", v)}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>10 mph</span>
                  <span>35 mph</span>
                  <span>60 mph</span>
                </div>
              </div>
            )}
          </div>

          {/* Thunderstorms */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CloudLightning className="h-5 w-5 text-yellow-500" />
              <div>
                <Label className="font-medium">Block Thunderstorms</Label>
                <p className="text-xs text-muted-foreground">
                  Thunderstorms with or without hail
                </p>
              </div>
            </div>
            <Switch
              checked={parsed.block_thunderstorms}
              onCheckedChange={(v) => updateSetting("block_thunderstorms", v)}
            />
          </div>

          {/* Freezing Rain */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CloudDrizzle className="h-5 w-5 text-indigo-400" />
              <div>
                <Label className="font-medium">Block Freezing Rain</Label>
                <p className="text-xs text-muted-foreground">
                  Freezing drizzle and freezing rain
                </p>
              </div>
            </div>
            <Switch
              checked={parsed.block_freezing_rain}
              onCheckedChange={(v) => updateSetting("block_freezing_rain", v)}
            />
          </div>

          {/* Fog */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CloudFog className="h-5 w-5 text-gray-400" />
              <div>
                <Label className="font-medium">Block Foggy Days</Label>
                <p className="text-xs text-muted-foreground">
                  Fog and depositing rime fog
                </p>
              </div>
            </div>
            <Switch
              checked={parsed.block_fog}
              onCheckedChange={(v) => updateSetting("block_fog", v)}
            />
          </div>

          {/* Info */}
          <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
            <p>
              Weather Guard uses the <strong>Open-Meteo</strong> forecast API to
              check upcoming weather at your verified business location. When a
              forecasted hour matches one of your blocked conditions, that
              time&nbsp;slot will be marked unavailable on your public booking
              page. Forecasts cover up to 16 days ahead.
            </p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

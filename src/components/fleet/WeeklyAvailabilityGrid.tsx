/**
 * WeeklyAvailabilityGrid — 7-day schedule editor.
 * Reads / writes to the technician_availability table.
 * Each day row shows: toggle enabled, start time, end time.
 */

import { useState, useEffect, useCallback } from "react";
import {
  fetchTechnicianAvailability,
  saveTechnicianAvailability,
} from "@/application/queries/technician-availability.query";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import { Save } from "lucide-react";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DAY_LABELS: Record<string, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed",
  thursday: "Thu", friday: "Fri", saturday: "Sat", sunday: "Sun",
};

interface DayRow {
  weekday: string;
  is_available: boolean;
  start_time: string;
  end_time: string;
  existingId?: string;
}

interface Props {
  technicianId: string;
  userId: string;
}

export const WeeklyAvailabilityGrid = ({ technicianId, userId }: Props) => {
  const [rows, setRows] = useState<DayRow[]>(
    DAYS.map(d => ({ weekday: d, is_available: false, start_time: "08:00", end_time: "17:00" }))
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadAvailability = useCallback(async () => {
    setLoading(true);
    const data = await fetchTechnicianAvailability(technicianId);
    const map = new Map(data.map((r) => [r.weekday, r]));
    setRows(DAYS.map(d => {
      const existing = map.get(d);
      return {
        weekday: d,
        is_available: existing?.is_available ?? false,
        start_time: existing?.start_time ?? "08:00",
        end_time: existing?.end_time ?? "17:00",
        existingId: existing?.id,
      };
    }));
    setLoading(false);
  }, [technicianId]);

  useEffect(() => { loadAvailability(); }, [loadAvailability]);

  const update = (idx: number, patch: Partial<DayRow>) =>
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));

  const save = async () => {
    setSaving(true);
    try {
      await saveTechnicianAvailability(technicianId, userId, rows);
      toast.success("Availability saved");
    } catch {
      toast.error("Failed to save availability");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton className="h-48 w-full rounded-lg" />;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {rows.map((row, idx) => (
          <div key={row.weekday} className="flex items-center gap-3">
            {/* Day label + toggle */}
            <div className="flex items-center gap-2 w-24 shrink-0">
              <Switch
                checked={row.is_available}
                onCheckedChange={v => update(idx, { is_available: v })}
              />
              <span className={`text-sm font-medium ${row.is_available ? "text-foreground" : "text-muted-foreground"}`}>
                {DAY_LABELS[row.weekday]}
              </span>
            </div>
            {/* Time pickers */}
            {row.is_available ? (
              <div className="flex items-center gap-2 flex-1">
                <Input
                  type="time"
                  value={row.start_time}
                  onChange={e => update(idx, { start_time: e.target.value })}
                  className="h-8 text-xs w-28"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <Input
                  type="time"
                  value={row.end_time}
                  onChange={e => update(idx, { end_time: e.target.value })}
                  className="h-8 text-xs w-28"
                />
                <span className="text-xs text-muted-foreground">
                  ({calcHours(row.start_time, row.end_time)}h)
                </span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground italic">Day off</span>
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-end pt-1">
        <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
          <Save className="h-3.5 w-3.5" />
          {saving ? "Saving…" : "Save Availability"}
        </Button>
      </div>
    </div>
  );
};

function calcHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return Math.round(((eh * 60 + em) - (sh * 60 + sm)) / 60 * 10) / 10;
}

import { useCallback, useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import {
  getSessionUserId,
  fetchAvailabilityPageData,
} from "@/application/queries/availability-settings.query";
import {
  saveAvailabilitySettings,
  blockDate as blockDateApi,
  unblockDate as unblockDateApi,
  upsertIntakeQuestion,
  deleteIntakeQuestion as deleteIntakeQuestionApi,
  toggleIntakeQuestionActive,
} from "@/application/commands/availability-settings.command";
import { toast } from "@/components/ui/sonner";
import { Save, Ban, Clock, Globe, Timer, CalendarDays, CalendarRange, Hourglass, FileText, Shield, Plus, Trash2, GripVertical, CheckSquare } from "lucide-react";
import { format, isSameDay } from "date-fns";
import { cn } from "@/lib/utils";
import { MAPBOX_ACCESS_TOKEN } from "@/lib/mapbox";

/** Parse a date-only string (yyyy-MM-dd) as local midnight, avoiding UTC shift. */
const parseLocalDate = (d: string) => new Date(d + "T00:00:00");

interface DayHours {
  open: string;
  close: string;
  is_open: boolean;
}

interface WeeklySchedule {
  monday: DayHours;
  tuesday: DayHours;
  wednesday: DayHours;
  thursday: DayHours;
  friday: DayHours;
  saturday: DayHours;
  sunday: DayHours;
}

interface ServiceAreaRule {
  id: string;
  label: string;
  address: string;
  coordinates: { lat: number; lng: number } | null;
  radius_miles: number;
  days: string[];
  allow_overlap: boolean;
  split_policy: "allow" | "prefer_primary" | "manual_review";
}

interface BlockedDate {
  id: string;
  blocked_date: string;
  reason: string | null;
}

interface SchedulingSettings {
  buffer_time_before: number;
  buffer_time_after: number;
  min_lead_time_hours: number;
  max_advance_days: number;
  allow_multi_day_bookings: boolean;
  slot_duration_minutes: number;
}

interface PolicySettings {
  require_approval: boolean;
  cancellation_window_hours: number;
  allow_cancellation: boolean;
  allow_rescheduling: boolean;
  reschedule_window_hours: number;
  terms_and_conditions: string;
  require_terms_acceptance: boolean;
}

interface IntakeQuestion {
  id: string;
  question_text: string;
  question_type: "text" | "textarea" | "select" | "checkbox";
  options: string[] | null;
  is_required: boolean;
  sort_order: number;
  is_active: boolean;
}

const defaultSchedule: WeeklySchedule = {
  monday: { open: "09:00", close: "17:00", is_open: true },
  tuesday: { open: "09:00", close: "17:00", is_open: true },
  wednesday: { open: "09:00", close: "17:00", is_open: true },
  thursday: { open: "09:00", close: "17:00", is_open: true },
  friday: { open: "09:00", close: "17:00", is_open: true },
  saturday: { open: "09:00", close: "17:00", is_open: false },
  sunday: { open: "09:00", close: "17:00", is_open: false },
};

const defaultSettings: SchedulingSettings = {
  buffer_time_before: 0,
  buffer_time_after: 0,
  min_lead_time_hours: 2,
  max_advance_days: 30,
  allow_multi_day_bookings: false,
  slot_duration_minutes: 30,
};

const defaultPolicies: PolicySettings = {
  require_approval: false,
  cancellation_window_hours: 24,
  allow_cancellation: true,
  allow_rescheduling: true,
  reschedule_window_hours: 24,
  terms_and_conditions: "",
  require_terms_acceptance: false,
};

const dayNames = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const dayLabels: Record<string, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

const defaultServiceAreaRule = (): ServiceAreaRule => ({
  id: crypto.randomUUID(),
  label: "",
  address: "",
  coordinates: null,
  radius_miles: 15,
  days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
  allow_overlap: true,
  split_policy: "allow",
});

export default function Availability() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [schedule, setSchedule] = useState<WeeklySchedule>(defaultSchedule);
  const [settings, setSettings] = useState<SchedulingSettings>(defaultSettings);
  const [policies, setPolicies] = useState<PolicySettings>(defaultPolicies);
  const [intakeQuestions, setIntakeQuestions] = useState<IntakeQuestion[]>([]);
  const [blockedDates, setBlockedDates] = useState<BlockedDate[]>([]);
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [timezone, setTimezone] = useState("UTC");
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [blockReason, setBlockReason] = useState("");
  const [datesToBlock, setDatesToBlock] = useState<Date[]>([]);
  const [questionDialogOpen, setQuestionDialogOpen] = useState(false);
  const [serviceAreas, setServiceAreas] = useState<ServiceAreaRule[]>([]);
  const [geocodingAreaId, setGeocodingAreaId] = useState<string | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<IntakeQuestion | null>(null);
  const [newQuestion, setNewQuestion] = useState({
    question_text: "",
    question_type: "text" as "text" | "textarea" | "select" | "checkbox",
    options: "",
    is_required: false,
  });
  const initialTab = searchParams.get("tab") === "areas" ? "areas" : "hours";


  const loadData = useCallback(async (userId: string) => {
    setLoading(true);
    try {
      const { profile, blocked, questions } = await fetchAvailabilityPageData(userId);

      if (profile) {
        if (profile.day_hours) {
          const raw = profile.day_hours as Record<string, unknown>;
          const extractedSchedule = dayNames.reduce((acc, day) => {
            const row = (raw?.[day] ?? defaultSchedule[day]) as DayHours;
            acc[day] = {
              open: row?.open || defaultSchedule[day].open,
              close: row?.close || defaultSchedule[day].close,
              is_open: typeof row?.is_open === "boolean" ? row.is_open : defaultSchedule[day].is_open,
            };
            return acc;
          }, {} as WeeklySchedule);
          setSchedule(extractedSchedule);
          if (Array.isArray(raw?.service_area_rules)) {
            setServiceAreas(raw.service_area_rules as ServiceAreaRule[]);
          }
        }
        if (profile.timezone) {
          setTimezone(profile.timezone);
        }
        setSettings({
          buffer_time_before: profile.buffer_time_before ?? 0,
          buffer_time_after: profile.buffer_time_after ?? 0,
          min_lead_time_hours: profile.min_lead_time_hours ?? 2,
          max_advance_days: profile.max_advance_days ?? 30,
          allow_multi_day_bookings: profile.allow_multi_day_bookings ?? false,
          slot_duration_minutes: profile.slot_duration_minutes ?? 30,
        });
        setPolicies({
          require_approval: profile.require_approval ?? false,
          cancellation_window_hours: profile.cancellation_window_hours ?? 24,
          allow_cancellation: profile.allow_cancellation ?? true,
          allow_rescheduling: profile.allow_rescheduling ?? true,
          reschedule_window_hours: profile.reschedule_window_hours ?? 24,
          terms_and_conditions: profile.terms_and_conditions ?? "",
          require_terms_acceptance: profile.require_terms_acceptance ?? false,
        });
      }

      setBlockedDates(blocked as BlockedDate[]);
      setSelectedDates(blocked.map((b: any) => parseLocalDate(b.blocked_date)));
      setIntakeQuestions(questions as IntakeQuestion[]);
    } catch (error) {
      console.error("Error loading availability data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const checkAuthAndLoadData = useCallback(async () => {
    const userId = await getSessionUserId();
    if (!userId) {
      navigate("/login");
      return;
    }
    await loadData(userId);
  }, [loadData, navigate]);

  useEffect(() => {
    void Promise.resolve().then(() => checkAuthAndLoadData());
  }, [checkAuthAndLoadData]);

  const handleScheduleChange = (day: keyof WeeklySchedule, field: keyof DayHours, value: string | boolean) => {
    setSchedule(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        [field]: value,
      },
    }));
  };

  const handleSettingsChange = <K extends keyof SchedulingSettings>(key: K, value: SchedulingSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handlePoliciesChange = <K extends keyof PolicySettings>(key: K, value: PolicySettings[K]) => {
    setPolicies(prev => ({ ...prev, [key]: value }));
  };

  const updateServiceArea = <K extends keyof ServiceAreaRule>(id: string, key: K, value: ServiceAreaRule[K]) => {
    setServiceAreas((prev) => prev.map((area) => (area.id === id ? { ...area, [key]: value } : area)));
  };

  const toggleServiceAreaDay = (id: string, day: string, checked: boolean) => {
    setServiceAreas((prev) =>
      prev.map((area) =>
        area.id !== id
          ? area
          : { ...area, days: checked ? [...new Set([...area.days, day])] : area.days.filter((d) => d !== day) },
      ),
    );
  };

  const geocodeServiceArea = async (id: string) => {
    const area = serviceAreas.find((x) => x.id === id);
    if (!area?.address.trim()) {
      toast.error("Enter an address before verifying area");
      return;
    }

    setGeocodingAreaId(id);
    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(area.address)}.json?access_token=${MAPBOX_ACCESS_TOKEN}&limit=1`,
      );
      const data = await response.json();
      if (data.features?.length > 0) {
        const [lng, lat] = data.features[0].center;
        updateServiceArea(id, "coordinates", { lat, lng });
        updateServiceArea(id, "address", data.features[0].place_name);
        toast.success("Service area address verified");
      } else {
        toast.error("Unable to locate that address");
      }
    } catch {
      toast.error("Address verification failed");
    } finally {
      setGeocodingAreaId(null);
    }
  };

  const handleSaveChanges = async () => {
    setSaving(true);
    try {
      const userId = await getSessionUserId();
      if (!userId) return;

      await saveAvailabilitySettings(userId, {
        day_hours: JSON.parse(JSON.stringify({
          ...schedule,
          service_area_rules: serviceAreas,
        })),
        buffer_time_before: settings.buffer_time_before,
        buffer_time_after: settings.buffer_time_after,
        min_lead_time_hours: settings.min_lead_time_hours,
        max_advance_days: settings.max_advance_days,
        allow_multi_day_bookings: settings.allow_multi_day_bookings,
        slot_duration_minutes: settings.slot_duration_minutes,
        require_approval: policies.require_approval,
        cancellation_window_hours: policies.cancellation_window_hours,
        allow_cancellation: policies.allow_cancellation,
        allow_rescheduling: policies.allow_rescheduling,
        reschedule_window_hours: policies.reschedule_window_hours,
        terms_and_conditions: policies.terms_and_conditions || null,
        require_terms_acceptance: policies.require_terms_acceptance,
      });

      toast.success("All settings saved successfully!");
    } catch (error) {
      console.error("Error saving availability:", error);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    
    const existingBlock = blockedDates.find(b => 
      isSameDay(parseLocalDate(b.blocked_date), date)
    );

    if (existingBlock) {
      handleUnblockDate(existingBlock.id);
    } else {
      setDatesToBlock([date]);
      setBlockReason("");
      setBlockDialogOpen(true);
    }
  };

  const handleBlockDates = async () => {
    try {
      const userId = await getSessionUserId();
      if (!userId) return;

      for (const date of datesToBlock) {
        const formattedDate = format(date, "yyyy-MM-dd");
        await blockDateApi(userId, formattedDate, blockReason || null);
      }

      await loadData(userId);
      setBlockDialogOpen(false);
      setDatesToBlock([]);
      setBlockReason("");
      toast.success("Date(s) blocked successfully!");
    } catch (error) {
      console.error("Error blocking dates:", error);
      toast.error("Failed to block dates");
    }
  };

  const handleUnblockDate = async (id: string) => {
    try {
      await unblockDateApi(id);

      setBlockedDates(prev => prev.filter(b => b.id !== id));
      setSelectedDates(prev => {
        const blockedDate = blockedDates.find(b => b.id === id);
        if (!blockedDate) return prev;
        return prev.filter(d => !isSameDay(d, parseLocalDate(blockedDate.blocked_date)));
      });

      toast.success("Date unblocked successfully!");
    } catch (error) {
      console.error("Error unblocking date:", error);
      toast.error("Failed to unblock date");
    }
  };

  const handleAddQuestion = async () => {
    try {
      const userId = await getSessionUserId();
      if (!userId) return;

      const optionsArray = newQuestion.question_type === "select" || newQuestion.question_type === "checkbox"
        ? newQuestion.options.split(",").map(o => o.trim()).filter(Boolean)
        : null;

      await upsertIntakeQuestion(userId, {
        id: editingQuestion?.id,
        question_text: newQuestion.question_text,
        question_type: newQuestion.question_type,
        options: optionsArray,
        is_required: newQuestion.is_required,
        sort_order: editingQuestion ? undefined : intakeQuestions.length,
      });

      toast.success(editingQuestion ? "Question updated!" : "Question added!");

      await loadData(userId);
      setQuestionDialogOpen(false);
      setEditingQuestion(null);
      setNewQuestion({ question_text: "", question_type: "text", options: "", is_required: false });
    } catch (error) {
      console.error("Error saving question:", error);
      toast.error("Failed to save question");
    }
  };

  const handleDeleteQuestion = async (id: string) => {
    try {
      await deleteIntakeQuestionApi(id);
      setIntakeQuestions(prev => prev.filter(q => q.id !== id));
      toast.success("Question deleted!");
    } catch (error) {
      console.error("Error deleting question:", error);
      toast.error("Failed to delete question");
    }
  };

  const handleToggleQuestionActive = async (id: string, isActive: boolean) => {
    try {
      await toggleIntakeQuestionActive(id, isActive);
      setIntakeQuestions(prev => prev.map(q => q.id === id ? { ...q, is_active: isActive } : q));
    } catch (error) {
      console.error("Error updating question:", error);
    }
  };

  const isDateBlocked = (date: Date) => {
    return blockedDates.some(b => isSameDay(parseLocalDate(b.blocked_date), date));
  };

  const getDayOfWeek = (date: Date): keyof WeeklySchedule => {
    const days: (keyof WeeklySchedule)[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    return days[date.getDay()];
  };

  const isClosedDay = (date: Date) => {
    const day = getDayOfWeek(date);
    return !schedule[day].is_open;
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Availability & Policies</h1>
            <p className="text-muted-foreground">Complete control over scheduling, booking rules, and policies.</p>
          </div>
          <div className="flex gap-2">
            <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Ban className="h-4 w-4 mr-2" />
                  Block Time
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Block Date</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Select dates to block</Label>
                    <Calendar
                      mode="multiple"
                      selected={datesToBlock}
                      onSelect={(dates) => setDatesToBlock(dates || [])}
                      disabled={(date) => date < new Date() || isDateBlocked(date)}
                      className="rounded-md border pointer-events-auto"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reason">Reason (optional)</Label>
                    <Textarea
                      id="reason"
                      placeholder="e.g., Holiday, Personal day, etc."
                      value={blockReason}
                      onChange={(e) => setBlockReason(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setBlockDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleBlockDates} disabled={datesToBlock.length === 0}>
                    Block {datesToBlock.length} Date{datesToBlock.length !== 1 ? "s" : ""}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button onClick={handleSaveChanges} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Saving..." : "Save All Changes"}
            </Button>
          </div>
        </div>

        <Tabs defaultValue={initialTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 lg:grid-cols-7 lg:w-auto lg:inline-grid">
            <TabsTrigger value="hours">Hours</TabsTrigger>
            <TabsTrigger value="areas">Service Areas</TabsTrigger>
            <TabsTrigger value="blackout">Blackout</TabsTrigger>
            <TabsTrigger value="booking">Booking</TabsTrigger>
            <TabsTrigger value="slots">Slots</TabsTrigger>
            <TabsTrigger value="policies">Policies</TabsTrigger>
            <TabsTrigger value="intake">Intake Forms</TabsTrigger>
          </TabsList>

          {/* Operating Hours Tab */}
          <TabsContent value="hours" className="space-y-6">
            <div className="grid lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Weekly Schedule
                  </CardTitle>
                  <CardDescription>Set your standard operating hours for each day.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {dayNames.map((day) => (
                    <div key={day} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-[100px]">
                        <Switch
                          checked={schedule[day].is_open}
                          onCheckedChange={(checked) => handleScheduleChange(day, "is_open", checked)}
                        />
                        <span className={cn("text-sm font-medium", !schedule[day].is_open && "text-muted-foreground")}>
                          {dayLabels[day]}
                        </span>
                      </div>
                      {schedule[day].is_open ? (
                        <div className="flex items-center gap-1">
                          <Input type="time" value={schedule[day].open} onChange={(e) => handleScheduleChange(day, "open", e.target.value)} className="w-24 h-8 text-xs" />
                          <span className="text-muted-foreground">-</span>
                          <Input type="time" value={schedule[day].close} onChange={(e) => handleScheduleChange(day, "close", e.target.value)} className="w-24 h-8 text-xs" />
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">Closed</span>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5" />
                    Timezone
                  </CardTitle>
                  <CardDescription>Your current timezone for all scheduling.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 p-4 bg-muted/50 rounded-lg">
                    <Globe className="h-5 w-5 text-muted-foreground" />
                    <span className="font-medium">{timezone}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">Change timezone in Settings → Regional Settings</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="areas" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  Area Coverage Rules
                </CardTitle>
                <CardDescription>
                  Create multiple service areas by address + miles radius, assign operating days, and choose overlap/split behavior.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setServiceAreas((prev) => [...prev, defaultServiceAreaRule()])}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Service Area
                  </Button>
                </div>

                {serviceAreas.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No service areas yet. Add one to start routing by distance and day.</p>
                ) : (
                  <div className="space-y-4">
                    {serviceAreas.map((area, idx) => (
                      <div key={area.id} className="rounded-lg border p-4 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <Input
                            placeholder={`Area ${idx + 1} name (e.g. North Zone)`}
                            value={area.label}
                            onChange={(e) => updateServiceArea(area.id, "label", e.target.value)}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setServiceAreas((prev) => prev.filter((x) => x.id !== area.id))}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>

                        <div className="flex gap-2">
                          <Input
                            placeholder="Service area center address"
                            value={area.address}
                            onChange={(e) => updateServiceArea(area.id, "address", e.target.value)}
                          />
                          <Button type="button" variant="outline" onClick={() => geocodeServiceArea(area.id)} disabled={geocodingAreaId === area.id}>
                            {geocodingAreaId === area.id ? "Verifying..." : "Verify"}
                          </Button>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label>Radius</Label>
                            <span className="text-sm font-medium">{area.radius_miles} mi</span>
                          </div>
                          <Slider
                            min={1}
                            max={120}
                            step={1}
                            value={[area.radius_miles]}
                            onValueChange={([value]) => updateServiceArea(area.id, "radius_miles", value)}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Service Days</Label>
                          <div className="flex flex-wrap gap-3">
                            {dayNames.map((day) => (
                              <label key={`${area.id}-${day}`} className="flex items-center gap-2 text-sm">
                                <Checkbox
                                  checked={area.days.includes(day)}
                                  onCheckedChange={(checked: boolean) => toggleServiceAreaDay(area.id, day, !!checked)}
                                />
                                {dayLabels[day]}
                              </label>
                            ))}
                          </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="flex items-center justify-between rounded border p-3">
                            <div>
                              <p className="text-sm font-medium">Allow overlaps</p>
                              <p className="text-xs text-muted-foreground">Allow jobs to match multiple service areas.</p>
                            </div>
                            <Switch
                              checked={area.allow_overlap}
                              onCheckedChange={(checked) => updateServiceArea(area.id, "allow_overlap", checked)}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>Split behavior</Label>
                            <Select value={area.split_policy} onValueChange={(value: ServiceAreaRule["split_policy"]) => updateServiceArea(area.id, "split_policy", value)}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="allow">Allow split across areas</SelectItem>
                                <SelectItem value="prefer_primary">Prefer primary area</SelectItem>
                                <SelectItem value="manual_review">Require manual review</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Blackout Dates Tab */}
          <TabsContent value="blackout" className="space-y-6">
            <div className="grid lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Ban className="h-5 w-5" />
                    Block Out Dates
                  </CardTitle>
                  <CardDescription>Click on dates to block holidays, breaks, or personal time.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-center">
                    <Calendar
                      mode="single"
                      onSelect={handleDateSelect}
                      className="rounded-md border p-4 pointer-events-auto"
                      modifiers={{ blocked: (date) => isDateBlocked(date), closed: (date) => isClosedDay(date) && !isDateBlocked(date) }}
                      modifiersClassNames={{ blocked: "bg-destructive/80 text-destructive-foreground hover:bg-destructive/90", closed: "bg-muted text-muted-foreground" }}
                      disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Blocked Dates</CardTitle>
                  <CardDescription>{blockedDates.length} date{blockedDates.length !== 1 ? "s" : ""} blocked</CardDescription>
                </CardHeader>
                <CardContent>
                  {blockedDates.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No dates blocked yet.</p>
                  ) : (
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                      {blockedDates.map((blocked) => (
                        <div key={blocked.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
                          <div>
                            <p className="font-medium text-sm">{format(parseLocalDate(blocked.blocked_date), "MMM d, yyyy")}</p>
                            {blocked.reason && <p className="text-xs text-muted-foreground">{blocked.reason}</p>}
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => handleUnblockDate(blocked.id)} className="h-8 w-8 p-0 text-destructive hover:text-destructive">×</Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Booking Rules Tab */}
          <TabsContent value="booking" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Hourglass className="h-5 w-5" />Lead Time</CardTitle>
                  <CardDescription>Control how close to the start time someone can book.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Minimum advance booking time</Label>
                    <Select value={String(settings.min_lead_time_hours)} onValueChange={(value) => handleSettingsChange("min_lead_time_hours", Number(value))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">No minimum</SelectItem>
                        <SelectItem value="1">1 hour</SelectItem>
                        <SelectItem value="2">2 hours</SelectItem>
                        <SelectItem value="4">4 hours</SelectItem>
                        <SelectItem value="8">8 hours</SelectItem>
                        <SelectItem value="24">24 hours (1 day)</SelectItem>
                        <SelectItem value="48">48 hours (2 days)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><CalendarRange className="h-5 w-5" />Scheduling Window</CardTitle>
                  <CardDescription>Control how far into the future someone can book.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Maximum advance booking</Label>
                    <Select value={String(settings.max_advance_days)} onValueChange={(value) => handleSettingsChange("max_advance_days", Number(value))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">7 days</SelectItem>
                        <SelectItem value="14">14 days</SelectItem>
                        <SelectItem value="30">30 days</SelectItem>
                        <SelectItem value="60">60 days</SelectItem>
                        <SelectItem value="90">90 days</SelectItem>
                        <SelectItem value="180">180 days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5" />Multi-Day Bookings</CardTitle>
                  <CardDescription>Allow services that span multiple days.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Allow multi-day bookings</Label>
                      <p className="text-sm text-muted-foreground">Enable for large projects.</p>
                    </div>
                    <Switch checked={settings.allow_multi_day_bookings} onCheckedChange={(checked) => handleSettingsChange("allow_multi_day_bookings", checked)} />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Time Slots Tab */}
          <TabsContent value="slots" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Timer className="h-5 w-5" />Buffer Times</CardTitle>
                  <CardDescription>Add padding before or after appointments.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <div className="flex justify-between"><Label>Buffer before</Label><span className="text-sm font-medium">{settings.buffer_time_before} min</span></div>
                    <Slider value={[settings.buffer_time_before]} onValueChange={([value]) => handleSettingsChange("buffer_time_before", value)} max={60} step={5} />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between"><Label>Buffer after</Label><span className="text-sm font-medium">{settings.buffer_time_after} min</span></div>
                    <Slider value={[settings.buffer_time_after]} onValueChange={([value]) => handleSettingsChange("buffer_time_after", value)} max={60} step={5} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" />Slot Duration</CardTitle>
                  <CardDescription>Set the base duration for time slots.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Label>Time slot duration</Label>
                    <Select value={String(settings.slot_duration_minutes)} onValueChange={(value) => handleSettingsChange("slot_duration_minutes", Number(value))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15">15 minutes</SelectItem>
                        <SelectItem value="30">30 minutes</SelectItem>
                        <SelectItem value="45">45 minutes</SelectItem>
                        <SelectItem value="60">60 minutes</SelectItem>
                        <SelectItem value="90">90 minutes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Policies Tab */}
          <TabsContent value="policies" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><CheckSquare className="h-5 w-5" />Approval Workflow</CardTitle>
                  <CardDescription>Control how bookings are confirmed.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Require approval</Label>
                      <p className="text-sm text-muted-foreground">
                        {policies.require_approval ? "You must manually approve each booking request." : "Bookings are instantly confirmed."}
                      </p>
                    </div>
                    <Switch checked={policies.require_approval} onCheckedChange={(checked) => handlePoliciesChange("require_approval", checked)} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Ban className="h-5 w-5" />Cancellation Policy</CardTitle>
                  <CardDescription>Set rules for cancellations.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Allow cancellations</Label>
                      <p className="text-sm text-muted-foreground">Customers can cancel their bookings.</p>
                    </div>
                    <Switch checked={policies.allow_cancellation} onCheckedChange={(checked) => handlePoliciesChange("allow_cancellation", checked)} />
                  </div>
                  {policies.allow_cancellation && (
                    <div className="space-y-2">
                      <Label>Cancellation window</Label>
                      <Select value={String(policies.cancellation_window_hours)} onValueChange={(value) => handlePoliciesChange("cancellation_window_hours", Number(value))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">No restriction</SelectItem>
                          <SelectItem value="2">2 hours before</SelectItem>
                          <SelectItem value="4">4 hours before</SelectItem>
                          <SelectItem value="12">12 hours before</SelectItem>
                          <SelectItem value="24">24 hours before</SelectItem>
                          <SelectItem value="48">48 hours before</SelectItem>
                          <SelectItem value="72">72 hours before</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">Cancellations must be made at least {policies.cancellation_window_hours} hours in advance.</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><CalendarRange className="h-5 w-5" />Rescheduling Policy</CardTitle>
                  <CardDescription>Control if/when users can reschedule.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Allow rescheduling</Label>
                      <p className="text-sm text-muted-foreground">Customers can move their appointments.</p>
                    </div>
                    <Switch checked={policies.allow_rescheduling} onCheckedChange={(checked) => handlePoliciesChange("allow_rescheduling", checked)} />
                  </div>
                  {policies.allow_rescheduling && (
                    <div className="space-y-2">
                      <Label>Reschedule window</Label>
                      <Select value={String(policies.reschedule_window_hours)} onValueChange={(value) => handlePoliciesChange("reschedule_window_hours", Number(value))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">No restriction</SelectItem>
                          <SelectItem value="2">2 hours before</SelectItem>
                          <SelectItem value="4">4 hours before</SelectItem>
                          <SelectItem value="12">12 hours before</SelectItem>
                          <SelectItem value="24">24 hours before</SelectItem>
                          <SelectItem value="48">48 hours before</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />Terms and Conditions</CardTitle>
                  <CardDescription>Require customers to accept terms before booking.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Require terms acceptance</Label>
                      <p className="text-sm text-muted-foreground">Customers must check a box agreeing to your terms.</p>
                    </div>
                    <Switch checked={policies.require_terms_acceptance} onCheckedChange={(checked) => handlePoliciesChange("require_terms_acceptance", checked)} />
                  </div>
                  {policies.require_terms_acceptance && (
                    <div className="space-y-2">
                      <Label>Terms and Conditions</Label>
                      <Textarea
                        placeholder="Enter your terms and conditions, cancellation policy, liability waiver, etc."
                        value={policies.terms_and_conditions}
                        onChange={(e) => handlePoliciesChange("terms_and_conditions", e.target.value)}
                        rows={6}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Intake Forms Tab */}
          <TabsContent value="intake" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Intake Questions</CardTitle>
                    <CardDescription>Create custom questions customers must answer during booking.</CardDescription>
                  </div>
                  <Dialog open={questionDialogOpen} onOpenChange={(open) => {
                    setQuestionDialogOpen(open);
                    if (!open) {
                      setEditingQuestion(null);
                      setNewQuestion({ question_text: "", question_type: "text", options: "", is_required: false });
                    }
                  }}>
                    <DialogTrigger asChild>
                      <Button><Plus className="h-4 w-4 mr-2" />Add Question</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{editingQuestion ? "Edit Question" : "Add Intake Question"}</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label>Question Text</Label>
                          <Input
                            placeholder="e.g., Do you have any concerns about your vehicle?"
                            value={newQuestion.question_text}
                            onChange={(e) => setNewQuestion(prev => ({ ...prev, question_text: e.target.value }))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Question Type</Label>
                          <Select value={newQuestion.question_type} onValueChange={(value: any) => setNewQuestion(prev => ({ ...prev, question_type: value }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="text">Short Text</SelectItem>
                              <SelectItem value="textarea">Long Text</SelectItem>
                              <SelectItem value="select">Dropdown</SelectItem>
                              <SelectItem value="checkbox">Checkboxes</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {(newQuestion.question_type === "select" || newQuestion.question_type === "checkbox") && (
                          <div className="space-y-2">
                            <Label>Options (comma-separated)</Label>
                            <Input
                              placeholder="Option 1, Option 2, Option 3"
                              value={newQuestion.options}
                              onChange={(e) => setNewQuestion(prev => ({ ...prev, options: e.target.value }))}
                            />
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={newQuestion.is_required}
                            onCheckedChange={(checked) => setNewQuestion(prev => ({ ...prev, is_required: checked }))}
                          />
                          <Label>Required question</Label>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setQuestionDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleAddQuestion} disabled={!newQuestion.question_text.trim()}>
                          {editingQuestion ? "Update" : "Add"} Question
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {intakeQuestions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No intake questions yet.</p>
                    <p className="text-sm">Add questions to collect information from customers during booking.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {intakeQuestions.map((q, index) => (
                      <div key={q.id} className={cn("flex items-center gap-3 p-4 rounded-lg border", !q.is_active && "opacity-50")}>
                        <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab" />
                        <div className="flex-1">
                          <p className="font-medium">{q.question_text}</p>
                          <p className="text-sm text-muted-foreground">
                            {q.question_type === "text" && "Short text"}
                            {q.question_type === "textarea" && "Long text"}
                            {q.question_type === "select" && `Dropdown: ${(q.options as string[])?.join(", ")}`}
                            {q.question_type === "checkbox" && `Checkboxes: ${(q.options as string[])?.join(", ")}`}
                            {q.is_required && " • Required"}
                          </p>
                        </div>
                        <Switch checked={q.is_active} onCheckedChange={(checked) => handleToggleQuestionActive(q.id, checked)} />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingQuestion(q);
                            setNewQuestion({
                              question_text: q.question_text,
                              question_type: q.question_type,
                              options: (q.options as string[])?.join(", ") || "",
                              is_required: q.is_required,
                            });
                            setQuestionDialogOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteQuestion(q.id)} className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

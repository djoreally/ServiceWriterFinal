/**
 * Dispatch Monitor — read-only view of the dispatch algorithm's output.
 *
 * NOT a standalone tool. Accessible via Technician OS → "Run Dispatch Check".
 * The algorithm itself runs automatically when auto_dispatch_enabled = true.
 * This page lets you manually trigger a check for a specific appointment and
 * see the ranked candidate list without committing an assignment.
 */

import { useState, useEffect } from "react";
import {
  fetchDispatchableAppointments,
  invokeDispatchEngine,
  assignTechnicianRpc,
  type DispatchMonitorResult,
  type DispatchableAppointment,
} from "@/application/queries/dispatch-monitor.query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Zap, MapPin, Clock, Star, AlertTriangle, CheckCircle, XCircle,
  BarChart2, Navigation, Loader2, RefreshCw, ShieldCheck, ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

function ScoreBar({ value }: { value: number }) {
  const pct = value;
  const color = pct >= 70 ? "bg-gray-500" : pct >= 45 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-muted rounded-md h-1.5 overflow-hidden">
        <div className={`h-full rounded-md transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono font-semibold w-8 text-right">{value.toFixed(0)}</span>
    </div>
  );
}

const SKILL_TYPES = [
  "oil_change", "brakes", "fleet_diesel", "transmission", "tires",
  "electrical", "hvac", "engine_diagnostics", "suspension", "exhaust",
  "coolant_flush", "alignment", "inspection", "detailing"
];

export default function DispatchMonitorPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DispatchMonitorResult | null>(null);
  const [appointments, setAppointments] = useState<DispatchableAppointment[]>([]);

  // Job parameters
  const [selectedAppointment, setSelectedAppointment] = useState("");
  const [serviceType, setServiceType] = useState("oil_change");
  const [scheduledStart, setScheduledStart] = useState(() => {
    const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [duration, setDuration] = useState("60");
  const [isFleet, setIsFleet] = useState(false);

  const selectAppointment = (appointmentId: string) => {
    if (appointmentId === "manual") { setSelectedAppointment(""); return; }
    setSelectedAppointment(appointmentId);
    const appointment = appointments.find((item) => item.id === appointmentId);
    if (!appointment) return;
    const rawType = appointment.title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const aliases: Record<string, string> = { oilchange: "oil_change", brake_service: "brakes", brake_repair: "brakes", tire_service: "tires", diagnostics: "engine_diagnostics", ac_service: "hvac" };
    const normalizedType = aliases[rawType] || rawType;
    if (SKILL_TYPES.includes(normalizedType)) setServiceType(normalizedType);
    setScheduledStart(`${appointment.scheduled_date}T${(appointment.scheduled_time || "09:00").slice(0, 5)}`);
    setDuration(String(appointment.duration_minutes || 60));
  };

  useEffect(() => {
    fetchDispatchableAppointments().then(({ data, error }) => {
      if (error) toast.error("Could not load dispatchable appointments");
      else if (data) setAppointments(data);
    });
  }, []);

  const runCheck = async () => {
    setLoading(true);
    setResult(null);
    try {
      const body: Record<string, unknown> = {
        service_type: serviceType,
        scheduled_start: scheduledStart,
        estimated_duration_minutes: parseInt(duration),
        fleet_flag: isFleet,
        auto_assign: false, // Monitor mode — never auto-assign from here
      };
      if (selectedAppointment) body.appointment_id = selectedAppointment;

      const { data, error } = await invokeDispatchEngine(body);
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Dispatch engine returned no result");
      setResult(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown dispatch error";
      toast.error("Dispatch check failed: " + message);
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async (techId: string, techName: string) => {
    if (!selectedAppointment) {
      toast.error("Select an appointment first to assign");
      return;
    }
    const { error } = await assignTechnicianRpc(
      selectedAppointment,
      techId,
      `Manually assigned via Dispatch Monitor — score: ${result?.ranked_candidates?.find(c => c.technician_id === techId)?.final_score?.toFixed(1)}`,
    );
    if (error) { toast.error("Assignment failed"); return; }
    toast.success(`Assigned to ${techName}`);
    setResult(null);
  };

  return (
    <AppLayout title="Dispatch Monitor">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/team-os")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" /> Dispatch Monitor
            </h1>
            <p className="text-sm text-muted-foreground">
              Manually run the dispatch algorithm to see ranked candidates — without auto-assigning. Configure auto-dispatch in <span className="text-primary cursor-pointer underline" onClick={() => navigate("/settings")}>Settings → Dispatch Automation</span>.
            </p>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Job Parameters */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Job Parameters</CardTitle>
              <CardDescription>Define the job to find the best technician for</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Link to Appointment (optional)</Label>
                <Select value={selectedAppointment || "manual"} onValueChange={selectAppointment}>
                  <SelectTrigger><SelectValue placeholder="— Manual input —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">— Manual input —</SelectItem>
                    {appointments.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.title} · {a.scheduled_date}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Service Type</Label>
                <Select value={serviceType} onValueChange={setServiceType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SKILL_TYPES.map(s => (
                      <SelectItem key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Scheduled Start</Label>
                  <Input type="datetime-local" value={scheduledStart} onChange={e => setScheduledStart(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Duration (min)</Label>
                  <Input type="number" value={duration} onChange={e => setDuration(e.target.value)} min={15} step={15} />
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-orange-500/5 border border-orange-500/20">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-orange-500" />
                  <div>
                    <p className="text-sm font-medium">Fleet Job</p>
                    <p className="text-xs text-muted-foreground">Requires fleet certification · Raises performance weight</p>
                  </div>
                </div>
                <Switch checked={isFleet} onCheckedChange={setIsFleet} />
              </div>

              <Button onClick={runCheck} disabled={loading} className="w-full gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                Run Dispatch Check
              </Button>
            </CardContent>
          </Card>

          {/* Results */}
          {result && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  {result.fleet_mode && <Badge variant="outline" className="text-orange-500 border-orange-500">Fleet Mode</Badge>}
                  Results · {result.candidates_evaluated ?? 0} evaluated · {result.eliminated_count ?? 0} eliminated
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {result.ranked_candidates && result.ranked_candidates.length > 0 ? (
                  result.ranked_candidates.map((c, i) => (
                    <div key={c.technician_id} className={`p-3 rounded-lg border space-y-2 ${i === 0 ? "border-primary/40 bg-primary/5" : "border-border"}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {i === 0 ? <Zap className="h-4 w-4 text-primary" /> : <span className="text-xs text-muted-foreground w-4">#{c.rank}</span>}
                          <span className="font-semibold text-sm">{c.name}</span>
                          {i === 0 && <Badge className="text-xs">Best Match</Badge>}
                        </div>
                        <span className="font-mono text-sm font-bold">{c.final_score.toFixed(1)}</span>
                      </div>
                      <ScoreBar value={c.final_score} />
                      <div className="grid grid-cols-3 gap-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{c.distance_miles != null ? `${c.distance_miles.toFixed(1)}mi` : "?"}</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{c.scheduled_hours_today.toFixed(1)}h today</span>
                        <span className="flex items-center gap-1"><Star className="h-3 w-3" />{c.performance_score.toFixed(0)}/100</span>
                      </div>
                      {selectedAppointment && (
                        <Button
                          size="sm"
                          variant={i === 0 ? "default" : "outline"}
                          className="w-full h-7 text-xs"
                          onClick={() => handleAssign(c.technician_id, c.name)}
                        >
                          Assign {c.name}
                        </Button>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <AlertTriangle className="h-10 w-10 mx-auto mb-2 text-destructive/60" />
                    <p className="font-medium text-destructive">No eligible technicians</p>
                    <p className="text-xs mt-1">{result.message || "All candidates were eliminated by hard filters"}</p>
                  </div>
                )}

                {result.eliminated && result.eliminated.length > 0 && (
                  <>
                    <Separator />
                    <p className="text-xs font-medium text-muted-foreground">Eliminated</p>
                    {result.eliminated.map((e, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <XCircle className="h-3 w-3 text-destructive shrink-0" />
                        <span className="font-medium">{e.name}</span>
                        <span>— {e.reason}</span>
                      </div>
                    ))}
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

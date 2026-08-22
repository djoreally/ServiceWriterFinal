/**
 * TechShift — Shift Status / Start Day screen
 * 
 * Allows technician to clock in/out, view current shift duration,
 * take breaks, and see today's assignment summary before starting.
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Power, Coffee, LogOut, Clock, Truck, MapPin,
  Play, Pause, ArrowLeft, Loader2, AlertTriangle,
} from "lucide-react";
import { format, differenceInMinutes } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useTechContext } from "./TechAppLayout";
import { useTechShiftManagement } from "@/hooks/useTechShiftManagement";

interface ShiftData {
  id: string;
  clock_in: string;
  clock_out: string | null;
  status: string;
  break_duration_minutes: number | null;
}

interface TechSummary {
  name: string;
  status: string;
  van_name: string | null;
  jobs_today: number;
}

export default function TechShift() {
  const navigate = useNavigate();
  const { identity } = useTechContext();
  const { 
    shift, 
    metrics, 
    loading, 
    shiftHours, 
    shiftMinutes,
    clockIn, 
    clockOut, 
    startBreak, 
    endBreak 
  } = useTechShiftManagement(identity?.techId);
  
  const [acting, setActing] = useState(false);

  const handleClockIn = async () => {
    setActing(true);
    try {
      await clockIn();
    } finally {
      setActing(false);
    }
  };

  const handleClockOut = async () => {
    setActing(true);
    try {
      await clockOut();
    } finally {
      setActing(false);
    }
  };

  const handleBreakToggle = async () => {
    setActing(true);
    try {
      if (shift?.status === "on_break") {
        await endBreak();
      } else {
        await startBreak();
      }
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/tech-app")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Shift Status</h1>
          <p className="text-sm text-muted-foreground">
            {format(new Date(), "EEEE, MMMM d")}
          </p>
        </div>
      </div>

      {/* Tech & Performance Summary */}
      {identity && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold">{identity.name}</span>
              <Badge variant={identity.status === "available" ? "default" : "secondary"}>
                {identity.status}
              </Badge>
            </div>
            {metrics && (
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="text-center">
                  <div className="text-lg font-bold text-primary">{metrics.jobs_completed}</div>
                  <div className="text-xs text-muted-foreground">Completed</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-foreground">{metrics.jobs_remaining}</div>
                  <div className="text-xs text-muted-foreground">Remaining</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-amber-600">{metrics.efficiency_score}%</div>
                  <div className="text-xs text-muted-foreground">Efficiency</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Enterprise Shift Clock */}
      {shift ? (
        <Card className="border-primary/30">
          <CardContent className="p-6 text-center space-y-4">
            <div className="flex items-center justify-center gap-2 text-primary">
              <Clock className="h-5 w-5" />
              <span className="text-sm font-medium uppercase tracking-wide">Active Shift</span>
            </div>
            <div className="text-5xl font-mono font-bold tracking-tight">
              {String(shiftHours).padStart(2, "0")}:{String(shiftMinutes).padStart(2, "0")}
            </div>
            <p className="text-xs text-muted-foreground">
              Started at {format(new Date(shift.clock_in), "h:mm a")}
              {shift.break_duration_minutes ? ` · ${shift.break_duration_minutes}m break` : ""}
            </p>

            {shift.status === "on_break" && (
              <div className="flex items-center justify-center gap-2 text-amber-500">
                <Coffee className="h-4 w-4" />
                <span className="text-sm font-medium">On Break</span>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1 h-14 text-base gap-2"
                onClick={handleBreakToggle}
                disabled={acting}
              >
                {acting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : shift.status === "on_break" ? (
                  <><Play className="h-5 w-5" /> Resume</>
                ) : (
                  <><Pause className="h-5 w-5" /> Break</>
                )}
              </Button>
              <Button
                variant="destructive"
                className="flex-1 h-14 text-base gap-2"
                onClick={handleClockOut}
                disabled={acting}
              >
                <LogOut className="h-5 w-5" /> End Shift
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-6 text-center space-y-4">
            <div className="text-muted-foreground text-sm">No active shift</div>
            <Button
              size="lg"
              className="w-full h-16 text-lg gap-3"
              onClick={handleClockIn}
              disabled={acting}
            >
              {acting ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <Power className="h-6 w-6" />
              )}
              Start Day
            </Button>
            {metrics && metrics.jobs_remaining > 0 && (
              <p className="text-sm text-muted-foreground flex items-center justify-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                You have {metrics.jobs_remaining} jobs scheduled today
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Enterprise Shift Metrics */}
      {metrics && (
        <Card>
          <CardContent className="p-4">
            <h3 className="font-semibold mb-3">Today's Performance</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Hours Logged:</span>
                <span className="font-medium">{metrics.hours_today.toFixed(1)}h</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Break Time:</span>
                <span className="font-medium">{metrics.break_time_used.toFixed(1)}h</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Jobs Done:</span>
                <span className="font-medium">{metrics.jobs_completed}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Efficiency:</span>
                <span className={cn(
                  "font-medium",
                  metrics.efficiency_score >= 80 ? "text-gray-600" : 
                  metrics.efficiency_score >= 60 ? "text-amber-600" : "text-destructive"
                )}>
                  {metrics.efficiency_score}%
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

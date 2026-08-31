/**
 * TimeClock - Employee time tracking with GPS
 * 
 * Features:
 * - Clock in/out with location capture
 * - Break tracking
 * - Shift history view
 * - Mobile-optimized interface
 */

import { useState, useEffect, useCallback } from "react";
import {
  fetchTimeClockData,
  type TimeClockEntry,
} from "@/application/queries/time-clock.query";
import {
  clockIn as clockInCmd,
  clockOut as clockOutCmd,
  startBreak as startBreakCmd,
  endBreak as endBreakCmd,
} from "@/application/commands/time-clock.command";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Clock,
  Play,
  Pause,
  Square,
  Coffee,
  MapPin,
  Calendar,
  Timer,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  History,
  TrendingUp,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { format, formatDistanceToNow, parseISO, differenceInMinutes, startOfWeek, endOfWeek, isToday, isSameWeek } from "date-fns";
import { cn } from "@/lib/utils";

// TimeClockEntry type imported from query module

interface LocationData {
  lat: number;
  lng: number;
  accuracy?: number;
}

export function TimeClock() {
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [currentEntry, setCurrentEntry] = useState<TimeClockEntry | null>(null);
  const [entries, setEntries] = useState<TimeClockEntry[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [elapsedTime, setElapsedTime] = useState(0);
  const [confirmClockOut, setConfirmClockOut] = useState(false);
  const [weeklyStats, setWeeklyStats] = useState({ total: 0, regular: 0, overtime: 0 });

  // Update current time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Calculate elapsed time
  useEffect(() => {
    if (currentEntry && currentEntry.status !== "completed") {
      const clockIn = parseISO(currentEntry.clock_in);
      const breakMinutes = currentEntry.break_duration_minutes || 0;
      
      // If on break, add current break time
      let currentBreakMinutes = 0;
      if (currentEntry.status === "on_break" && currentEntry.break_start) {
        currentBreakMinutes = differenceInMinutes(new Date(), parseISO(currentEntry.break_start));
      }
      
      const totalMinutes = differenceInMinutes(new Date(), clockIn) - breakMinutes - currentBreakMinutes;
      void Promise.resolve().then(() => setElapsedTime(Math.max(0, totalMinutes)));
    }
  }, [currentEntry, currentTime]);

  const fetchData = useCallback(async () => {
    const { activeEntry, entries: recentEntries } = await fetchTimeClockData();

    setCurrentEntry(activeEntry);
    setEntries(recentEntries);

    // Calculate weekly stats
    const thisWeekEntries = recentEntries.filter(e =>
      e.status === "completed" &&
      isSameWeek(parseISO(e.clock_in), new Date())
    );

    const stats = thisWeekEntries.reduce((acc, e) => ({
      total: acc.total + (e.total_hours || 0),
      regular: acc.regular + (e.regular_hours || 0),
      overtime: acc.overtime + (e.overtime_hours || 0),
    }), { total: 0, regular: 0, overtime: 0 });

    setWeeklyStats(stats);
    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => fetchData());
  }, [fetchData]);

  const getCurrentLocation = (): Promise<LocationData | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
          });
        },
        (error) => {
          console.warn("Location error:", error);
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  };

  const handleClockIn = async () => {
    setProcessing(true);
    try {
      const location = await getCurrentLocation();
      
      await clockInCmd(location);

      toast.success("Clocked in successfully!");
      fetchData();
    } catch (error) {
      console.error("Clock in error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to clock in");
    } finally {
      setProcessing(false);
    }
  };

  const handleClockOut = async () => {
    setProcessing(true);
    try {
      const location = await getCurrentLocation();
      
      await clockOutCmd(location);

      toast.success("Clocked out successfully!");
      setConfirmClockOut(false);
      fetchData();
    } catch (error) {
      console.error("Clock out error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to clock out");
    } finally {
      setProcessing(false);
    }
  };

  const handleStartBreak = async () => {
    setProcessing(true);
    try {
      await startBreakCmd();

      toast.info("Break started");
      fetchData();
    } catch (error) {
      console.error("Start break error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to start break");
    } finally {
      setProcessing(false);
    }
  };

  const handleEndBreak = async () => {
    setProcessing(true);
    try {
      await endBreakCmd();

      toast.success("Welcome back!");
      fetchData();
    } catch (error) {
      console.error("End break error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to end break");
    } finally {
      setProcessing(false);
    }
  };

  const formatElapsedTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const formatHours = (hours: number | null) => {
    if (hours === null) return "—";
    return `${hours.toFixed(2)}h`;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const isClockedIn = currentEntry && currentEntry.status !== "completed";
  const isOnBreak = currentEntry?.status === "on_break";

  return (
    <div className="space-y-6">
      {/* Main Clock Card */}
      <Card className="overflow-hidden">
        <div className={cn(
          "p-6 text-center transition-colors",
          !isClockedIn && "bg-gradient-to-br from-primary/10 to-primary/5",
          isClockedIn && !isOnBreak && "bg-gradient-to-br from-green-500/10 to-green-500/5",
          isOnBreak && "bg-gradient-to-br from-orange-500/10 to-orange-500/5"
        )}>
          {/* Current Time */}
          <div className="mb-4">
            <p className="text-4xl font-mono font-bold">
              {format(currentTime, "h:mm:ss a")}
            </p>
            <p className="text-sm text-muted-foreground">
              {format(currentTime, "EEEE, MMMM d, yyyy")}
            </p>
          </div>

          {/* Status Display */}
          {isClockedIn && (
            <div className="mb-6">
              <Badge 
                variant="outline" 
                className={cn(
                  "text-lg py-2 px-4 gap-2",
                  isOnBreak ? "bg-orange-500/20 text-orange-700 border-orange-500" : "bg-gray-500/20 text-gray-700 border-green-500"
                )}
              >
                {isOnBreak ? (
                  <>
                    <Coffee className="h-5 w-5" />
                    On Break
                  </>
                ) : (
                  <>
                    <Timer className="h-5 w-5" />
                    Working
                  </>
                )}
              </Badge>

              <div className="mt-4">
                <p className="text-3xl font-bold">{formatElapsedTime(elapsedTime)}</p>
                <p className="text-sm text-muted-foreground">
                  Since {format(parseISO(currentEntry.clock_in), "h:mm a")}
                </p>
              </div>

              {currentEntry.break_duration_minutes > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  Break time: {currentEntry.break_duration_minutes}m
                </p>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-center gap-3">
            {!isClockedIn ? (
              <Button
                size="lg"
                onClick={handleClockIn}
                disabled={processing}
                className="gap-2 px-8"
              >
                {processing ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Play className="h-5 w-5" />
                )}
                Clock In
              </Button>
            ) : (
              <>
                {isOnBreak ? (
                  <Button
                    size="lg"
                    onClick={handleEndBreak}
                    disabled={processing}
                    className="gap-2 bg-gray-600 hover:bg-gray-700"
                  >
                    {processing ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Play className="h-5 w-5" />
                    )}
                    End Break
                  </Button>
                ) : (
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={handleStartBreak}
                    disabled={processing}
                    className="gap-2"
                  >
                    <Coffee className="h-5 w-5" />
                    Start Break
                  </Button>
                )}
                <Button
                  size="lg"
                  variant="destructive"
                  onClick={() => setConfirmClockOut(true)}
                  disabled={processing}
                  className="gap-2"
                >
                  <Square className="h-5 w-5" />
                  Clock Out
                </Button>
              </>
            )}
          </div>

          {/* Location indicator */}
          {isClockedIn && currentEntry.clock_in_location && (
            <div className="mt-4 flex items-center justify-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" />
              <span>Location captured at clock in</span>
            </div>
          )}
        </div>
      </Card>

      {/* Weekly Stats */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="h-5 w-5" />
            This Week's Hours
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-muted-foreground">Total Hours</span>
                <span className="font-bold">{weeklyStats.total.toFixed(1)}h / 40h</span>
              </div>
              <Progress value={(weeklyStats.total / 40) * 100} className="h-2" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-muted/30 rounded-lg text-center">
                <p className="text-2xl font-bold">{weeklyStats.regular.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">Regular Hours</p>
              </div>
              <div className="p-3 bg-orange-50 dark:bg-orange-950/30 rounded-lg text-center">
                <p className="text-2xl font-bold text-orange-600">{weeklyStats.overtime.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">Overtime</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Entries */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <History className="h-5 w-5" />
            Recent Time Entries
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>In</TableHead>
                  <TableHead>Out</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.filter(e => e.status === "completed").slice(0, 10).map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">
                      {isToday(parseISO(entry.clock_in)) ? "Today" : format(parseISO(entry.clock_in), "MMM d")}
                    </TableCell>
                    <TableCell>{format(parseISO(entry.clock_in), "h:mm a")}</TableCell>
                    <TableCell>
                      {entry.clock_out ? format(parseISO(entry.clock_out), "h:mm a") : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatHours(entry.total_hours)}
                    </TableCell>
                    <TableCell className="text-right">
                      {entry.approved_at ? (
                        <Badge variant="outline" className="bg-green-50 text-gray-700">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Approved
                        </Badge>
                      ) : (
                        <Badge variant="outline">Pending</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {entries.filter(e => e.status === "completed").length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No completed time entries yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Confirm Clock Out Dialog */}
      <AlertDialog open={confirmClockOut} onOpenChange={setConfirmClockOut}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Clock Out</AlertDialogTitle>
            <AlertDialogDescription>
              You've been working for <strong>{formatElapsedTime(elapsedTime)}</strong>.
              {currentEntry?.break_duration_minutes ? (
                <span> (excluding {currentEntry.break_duration_minutes}m break)</span>
              ) : null}
              <br /><br />
              Are you sure you want to clock out?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClockOut} disabled={processing}>
              {processing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Clock Out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Simplified mobile version for tablet/phone use
export function MobileTimeClock() {
  return (
    <div className="min-h-screen bg-background p-4">
      <TimeClock />
    </div>
  );
}

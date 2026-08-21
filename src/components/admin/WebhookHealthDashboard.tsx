import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  fetchWebhookEvents,
  calculateWebhookStats,
  replayWebhookEvent,
  dismissWebhookEvent,
  type WebhookEventLog,
  type WebhookStats,
} from "@/application/queries/webhook-health.query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  PlayCircle,
  Eye,
  Loader2,
  Activity,
  AlertCircle,
  Trash2,
  MailWarning,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

// Types imported from application layer

export function WebhookHealthDashboard() {
  const [events, setEvents] = useState<WebhookEventLog[]>([]);
  const [stats, setStats] = useState<WebhookStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<WebhookEventLog | null>(null);
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "failed" | "dead_letter">("all");

  const loadEvents = useCallback(async () => {
    setRefreshing(true);
    try {
      const typedEvents = await fetchWebhookEvents(filter);
      setEvents(typedEvents);
      setStats(calculateWebhookStats(typedEvents));
    } catch (err) {
      console.error("Error fetching webhook logs:", err);
      toast.error("Failed to load webhook logs");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const handleReplay = async (event: WebhookEventLog) => {
    setReplayingId(event.id);
    try {
      await replayWebhookEvent(event.id);
      toast.success("Event replayed successfully");
      loadEvents();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Replay failed");
    } finally {
      setReplayingId(null);
    }
  };

  const handleDismiss = async (event: WebhookEventLog) => {
    try {
      await dismissWebhookEvent(event.id);
      toast.success("Event dismissed");
      loadEvents();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Dismiss failed");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "succeeded":
        return (
          <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400 gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Succeeded
          </Badge>
        );
      case "replayed":
        return (
          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 gap-1">
            <PlayCircle className="h-3 w-3" />
            Replayed
          </Badge>
        );
      case "failed":
        return (
          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 gap-1">
            <AlertCircle className="h-3 w-3" />
            Failed
          </Badge>
        );
      case "dead_letter":
        return (
          <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 gap-1">
            <MailWarning className="h-3 w-3" />
            Dead Letter
          </Badge>
        );
      case "pending":
      case "processing":
        return (
          <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400 gap-1">
            <Clock className="h-3 w-3" />
            {status === "pending" ? "Pending" : "Processing"}
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-16 mb-2" />
                <Skeleton className="h-8 w-12" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Webhook Health
          </h2>
          <p className="text-sm text-muted-foreground">
            Monitor Stripe webhook events and manage failed deliveries
          </p>
        </div>
        <Button onClick={loadEvents} variant="outline" disabled={refreshing} className="gap-2">
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Success Rate</p>
                  <p className="text-2xl font-bold text-gray-600">{stats.successRate}%</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-gray-600/20" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Total Events</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </div>
                <Activity className="h-8 w-8 text-muted-foreground/20" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Failed</p>
                  <p className="text-2xl font-bold text-amber-600">{stats.failed}</p>
                </div>
                <AlertCircle className="h-8 w-8 text-amber-600/20" />
              </div>
            </CardContent>
          </Card>

          <Card className={stats.deadLetter > 0 ? "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20" : ""}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Dead Letter</p>
                  <p className="text-2xl font-bold text-red-600">{stats.deadLetter}</p>
                </div>
                <MailWarning className="h-8 w-8 text-red-600/20" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Replayed</p>
                  <p className="text-2xl font-bold text-blue-600">{stats.replayed}</p>
                </div>
                <PlayCircle className="h-8 w-8 text-blue-600/20" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Dead Letter Alert */}
      {stats && stats.deadLetter > 0 && (
        <Card className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
              <div>
                <p className="font-medium text-red-800 dark:text-red-200">
                  {stats.deadLetter} event{stats.deadLetter > 1 ? "s" : ""} in dead-letter queue
                </p>
                <p className="text-sm text-red-700 dark:text-red-300">
                  These events have exceeded the maximum retry attempts. Review and replay manually or dismiss if no longer needed.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2">
        <Button
          variant={filter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("all")}
        >
          All Events
        </Button>
        <Button
          variant={filter === "failed" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("failed")}
        >
          Failed & Dead Letter
        </Button>
        <Button
          variant={filter === "dead_letter" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("dead_letter")}
          className={stats?.deadLetter ? "border-red-300" : ""}
        >
          Dead Letter Only ({stats?.deadLetter || 0})
        </Button>
      </div>

      {/* Events Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Recent Webhook Events</CardTitle>
          <CardDescription>Last 100 events, newest first</CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No webhook events recorded yet</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Attempts</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((event) => (
                    <TableRow key={event.id} className={event.status === "dead_letter" ? "bg-red-50/50 dark:bg-red-950/10" : ""}>
                      <TableCell className="font-mono text-sm">
                        {event.event_type}
                      </TableCell>
                      <TableCell>{getStatusBadge(event.status)}</TableCell>
                      <TableCell>
                        <span className={event.attempts >= event.max_attempts ? "text-red-600 font-medium" : ""}>
                          {event.attempts}/{event.max_attempts}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedEvent(event)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {(event.status === "failed" || event.status === "dead_letter") && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleReplay(event)}
                                disabled={replayingId === event.id}
                              >
                                {replayingId === event.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <PlayCircle className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDismiss(event)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Event Detail Dialog */}
      <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">
              {selectedEvent?.event_type}
            </DialogTitle>
            <DialogDescription>
              Event ID: {selectedEvent?.stripe_event_id}
            </DialogDescription>
          </DialogHeader>

          {selectedEvent && (
            <ScrollArea className="flex-1">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    {getStatusBadge(selectedEvent.status)}
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Attempts</p>
                    <p className="font-medium">{selectedEvent.attempts} / {selectedEvent.max_attempts}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Received</p>
                    <p className="font-medium">
                      {format(new Date(selectedEvent.created_at), "PPpp")}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Last Attempt</p>
                    <p className="font-medium">
                      {format(new Date(selectedEvent.last_attempt_at), "PPpp")}
                    </p>
                  </div>
                </div>

                {selectedEvent.error_message && (
                  <div className="bg-red-50 dark:bg-red-950/30 p-4 rounded-lg">
                    <p className="text-sm font-medium text-red-800 dark:text-red-200">Error</p>
                    <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                      {selectedEvent.error_message}
                    </p>
                  </div>
                )}

                <div>
                  <p className="text-sm text-muted-foreground mb-2">Payload</p>
                  <pre className="bg-muted p-4 rounded-lg overflow-auto text-xs max-h-[300px]">
                    {JSON.stringify(selectedEvent.payload, null, 2)}
                  </pre>
                </div>

                {selectedEvent.replayed_at && (
                  <div className="bg-blue-50 dark:bg-blue-950/30 p-4 rounded-lg">
                    <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                      Replayed at {format(new Date(selectedEvent.replayed_at), "PPpp")}
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}

          {selectedEvent && (selectedEvent.status === "failed" || selectedEvent.status === "dead_letter") && (
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => handleDismiss(selectedEvent)}>
                <Trash2 className="h-4 w-4 mr-2" />
                Dismiss
              </Button>
              <Button onClick={() => handleReplay(selectedEvent)} disabled={replayingId === selectedEvent.id}>
                {replayingId === selectedEvent.id ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <PlayCircle className="h-4 w-4 mr-2" />
                )}
                Replay Event
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

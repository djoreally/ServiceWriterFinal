import { useCallback, useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/sonner";
import { RefreshCw, ArrowRight, Ban, Undo2, AlertTriangle, CheckCircle2, Link2, XCircle, MinusCircle } from "lucide-react";
import { format } from "date-fns";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";
import {
  fetchWebsiteBookingsQueue,
  prepareWebsiteBookingPushes,
  pushWebsiteBookings,
  setWebsiteBookingNeverPush,
} from "@/application/commands/website-bookings.command";
import {
  vehicleLabel,
  type PushDecision,
  type PushPreview,
  type PushResult,
  type WebsiteBooking,
  type WebsiteBookingListStatus,
} from "@/lib/website-bookings";

/**
 * Website Bookings queue — selectively push MOMS-website bookings into
 * Service Writer. Fully manual by design: nothing here fires on its own,
 * a push never moves a time, and every per-booking outcome (including the
 * server's real failure reason) is reported inline, never toast-only.
 */

type TabStatus = WebsiteBookingListStatus;
type View = "queue" | "confirm" | "results";

interface DecisionState {
  action: "push" | "link" | "skip" | "hold";
  link_appointment_id: string | null;
}

const money = (value: number) => `$${Number(value || 0).toFixed(2)}`;

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return format(date, "EEE, MMM d, yyyy · h:mm a");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export default function WebsiteBookings() {
  const workspaceId = getSelectedWorkspaceId();
  const [tab, setTab] = useState<TabStatus>("unpushed");
  const [rows, setRows] = useState<WebsiteBooking[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [view, setView] = useState<View>("queue");
  const [previews, setPreviews] = useState<PushPreview[]>([]);
  const [notFound, setNotFound] = useState<string[]>([]);
  const [decisions, setDecisions] = useState<Record<string, DecisionState>>({});
  const [results, setResults] = useState<PushResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchWebsiteBookingsQueue(workspaceId, tab);
      setRows(data);
      setSelected(new Set());
    } catch (error) {
      setRows([]);
      setLoadError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [workspaceId, tab]);

  useEffect(() => {
    if (view === "queue") void Promise.resolve().then(() => load());
  }, [load, view]);

  const toggleSelected = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));

  const startPrepare = async (bookingIds: string[]) => {
    if (!workspaceId || bookingIds.length === 0) return;
    setBusy(true);
    setActionError(null);
    try {
      const { previews: prepared, not_found } = await prepareWebsiteBookingPushes(workspaceId, bookingIds);
      const initial: Record<string, DecisionState> = {};
      for (const preview of prepared) {
        if (preview.blocked_reason) continue;
        if (preview.duplicate_candidates.length > 0) {
          initial[preview.booking.id] = {
            action: "link",
            link_appointment_id: preview.duplicate_candidates[0].appointment_id,
          };
        } else {
          initial[preview.booking.id] = { action: "push", link_appointment_id: null };
        }
      }
      setPreviews(prepared);
      setNotFound(not_found);
      setDecisions(initial);
      setView("confirm");
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const runPush = async () => {
    if (!workspaceId) return;
    const payload: PushDecision[] = previews
      .filter((preview) => !preview.blocked_reason && decisions[preview.booking.id])
      .map((preview) => {
        const decision = decisions[preview.booking.id];
        return {
          booking_id: preview.booking.id,
          action: decision.action,
          link_appointment_id: decision.action === "link" ? decision.link_appointment_id : null,
        };
      });
    if (payload.length === 0) return;
    setBusy(true);
    setActionError(null);
    try {
      const outcome = await pushWebsiteBookings(workspaceId, payload);
      setResults(outcome);
      setView("results");
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const toggleNeverPush = async (booking: WebsiteBooking, flag: boolean) => {
    if (!workspaceId) return;
    try {
      await setWebsiteBookingNeverPush(workspaceId, booking.id, flag);
      toast.success(flag ? "Marked as never push. It will stay out of the queue." : "Restored to the queue.");
      void load();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const previewById = useMemo(() => new Map(previews.map((p) => [p.booking.id, p])), [previews]);

  if (!workspaceId) {
    return (
      <AppLayout title="Website Bookings">
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Select a workspace first, then come back to push website bookings into it.
          </CardContent>
        </Card>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Website Bookings">
      <div className="space-y-4 p-4 sm:p-5 lg:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Website Bookings</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Bookings that came in through the MOMS website. Push the ones you want into Service Writer —
              nothing moves automatically, a push never changes the promised time, and the website quote is
              the price that lands.
            </p>
          </div>
          {view === "queue" && (
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
          )}
        </div>

        {actionError && view !== "results" && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <span>{actionError}</span>
          </div>
        )}

        {view === "queue" && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  ["unpushed", "Queue"],
                  ["pushed", "Pushed"],
                  ["never_push", "Never push"],
                ] as Array<[TabStatus, string]>
              ).map(([status, label]) => (
                <Button
                  key={status}
                  size="sm"
                  variant={tab === status ? "default" : "outline"}
                  onClick={() => setTab(status)}
                >
                  {label}
                </Button>
              ))}
              {tab === "unpushed" && selected.size > 0 && (
                <Button size="sm" className="ml-auto" disabled={busy} onClick={() => void startPrepare([...selected])}>
                  Push selected ({selected.size}) <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )}
            </div>

            {loadError ? (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <span>{loadError}</span>
              </div>
            ) : loading ? (
              <p className="text-sm text-muted-foreground">Loading website bookings…</p>
            ) : rows.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-sm text-muted-foreground">
                  {tab === "unpushed" && "No website bookings waiting. New website bookings will show up here."}
                  {tab === "pushed" && "Nothing has been pushed yet."}
                  {tab === "never_push" && "Nothing is marked never-push."}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  {tab === "unpushed" && (
                    <div className="flex items-center gap-2 border-b px-4 py-2 text-sm">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={(checked) => {
                          if (checked === true) setSelected(new Set(rows.map((r) => r.id)));
                          else setSelected(new Set());
                        }}
                      />
                      <span className="text-muted-foreground">Select all</span>
                    </div>
                  )}
                  <ul className="divide-y">
                    {rows.map((booking) => (
                      <li key={booking.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                        {tab === "unpushed" && (
                          <Checkbox
                            checked={selected.has(booking.id)}
                            onCheckedChange={(checked) => toggleSelected(booking.id, checked === true)}
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{booking.customer}</span>
                            <Badge variant="secondary">{booking.service}</Badge>
                            <Badge variant="outline">{money(booking.quoted_total_usd)}</Badge>
                            {booking.payment && <Badge variant="outline">Payment: {booking.payment}</Badge>}
                            {booking.source_channel && <Badge variant="outline">{booking.source_channel}</Badge>}
                            {tab === "pushed" && booking.status === "cancelled" && (
                              <Badge variant="destructive">Cancelled on website</Badge>
                            )}
                          </div>
                          <div className="mt-0.5 truncate text-sm text-muted-foreground">
                            {formatWhen(booking.scheduled_start)} · {vehicleLabel(booking.vehicle)} ·{" "}
                            {booking.phone ?? "no phone"} · {booking.address}
                          </div>
                          {tab === "pushed" && booking.pushed_sw_appointment_id && (
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              Service Writer appointment {booking.pushed_sw_appointment_id}
                              {booking.pushed_at ? ` · pushed ${format(new Date(booking.pushed_at), "MMM d, h:mm a")}` : ""}
                            </div>
                          )}
                          {tab === "unpushed" && booking.auto_push_last_error && (
                            <div className="mt-0.5 text-xs text-destructive">
                              Auto-push failed
                              {booking.auto_push_last_attempt_at
                                ? ` ${format(new Date(booking.auto_push_last_attempt_at), "MMM d, h:mm a")}`
                                : ""}
                              : {booking.auto_push_last_error}
                            </div>
                          )}
                        </div>
                        {tab === "unpushed" && (
                          <div className="flex gap-2">
                            <Button size="sm" disabled={busy} onClick={() => void startPrepare([booking.id])}>
                              Push <ArrowRight className="ml-1 h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => void toggleNeverPush(booking, true)}>
                              <Ban className="mr-1 h-3.5 w-3.5" /> Never push
                            </Button>
                          </div>
                        )}
                        {tab === "never_push" && (
                          <Button size="sm" variant="outline" onClick={() => void toggleNeverPush(booking, false)}>
                            <Undo2 className="mr-1 h-3.5 w-3.5" /> Restore
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {view === "confirm" && (
          <div className="space-y-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Confirm push</CardTitle>
                <CardDescription>
                  Check each booking before it lands in Service Writer. Duplicates default to linking against
                  the appointment that's already there — nothing is created twice unless you choose
                  "push anyway". Overlapping windows are flagged, never moved.
                </CardDescription>
              </CardHeader>
            </Card>

            {notFound.map((id) => (
              <div key={id} className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <span>Booking {id} is no longer in the unpushed queue, so it can't be pushed from here.</span>
              </div>
            ))}

            {previews.map((preview) => {
              const booking = preview.booking;
              const decision = decisions[booking.id];
              return (
                <Card key={booking.id}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{booking.customer}</span>
                      <Badge variant="secondary">{booking.service}</Badge>
                      <Badge variant="outline">{money(booking.quoted_total_usd)}</Badge>
                      <span className="text-sm text-muted-foreground">
                        {formatWhen(booking.scheduled_start)} · {preview.scheduled.duration_minutes} min window
                      </span>
                    </div>

                    {preview.blocked_reason ? (
                      <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                        <span>
                          <strong>Can't push:</strong> {preview.blocked_reason}
                        </span>
                      </div>
                    ) : (
                      <>
                        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                          <div>
                            <dt className="text-muted-foreground">Customer</dt>
                            <dd>
                              {preview.customer_match.kind === "existing"
                                ? `Existing — ${preview.customer_match.label}`
                                : "New customer will be created"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Vehicle</dt>
                            <dd>{vehicleLabel(booking.vehicle)}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Service address</dt>
                            <dd>
                              {booking.address}
                              {preview.geocode
                                ? ` (${preview.geocode.lat.toFixed(5)}, ${preview.geocode.lng.toFixed(5)})`
                                : ""}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Price that lands</dt>
                            <dd>{money(booking.quoted_total_usd)} — the website quote, locked</dd>
                          </div>
                        </dl>

                        {preview.duplicate_candidates.length > 0 && (
                          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                            <div className="flex items-center gap-2 font-medium">
                              <Link2 className="h-4 w-4" /> This job may already be in Service Writer
                            </div>
                            <ul className="mt-1 list-inside list-disc text-muted-foreground">
                              {preview.duplicate_candidates.map((candidate) => (
                                <li key={candidate.appointment_id}>
                                  {candidate.label} — {formatWhen(candidate.starts_at)} (
                                  {candidate.reason === "phone_match" ? "same phone" : "same customer & vehicle"})
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {(preview.overlaps.length > 0 || preview.batch_overlap_booking_ids.length > 0) && (
                          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                            <div className="flex items-center gap-2 font-medium">
                              <AlertTriangle className="h-4 w-4" /> Same window as other work
                            </div>
                            <ul className="mt-1 list-inside list-disc text-muted-foreground">
                              {preview.overlaps.map((overlap) => (
                                <li key={overlap.appointment_id}>
                                  {overlap.label} — {formatWhen(overlap.starts_at)}
                                </li>
                              ))}
                              {preview.batch_overlap_booking_ids.map((otherId) => (
                                <li key={otherId}>
                                  Also selected: {previewById.get(otherId)?.booking.customer ?? otherId}
                                </li>
                              ))}
                            </ul>
                            <p className="mt-1 text-muted-foreground">
                              Pushing anyway keeps both at their promised times — you'll see the stack in the
                              schedule.
                            </p>
                          </div>
                        )}

                        {decision && (
                          <div className="flex flex-wrap items-center gap-2">
                            <label className="text-sm text-muted-foreground" htmlFor={`decision-${booking.id}`}>
                              Action
                            </label>
                            <select
                              id={`decision-${booking.id}`}
                              className="h-9 rounded-md border bg-background px-2 text-sm"
                              value={decision.action === "link" ? `link:${decision.link_appointment_id}` : decision.action}
                              onChange={(event) => {
                                const value = event.target.value;
                                if (value.startsWith("link:")) {
                                  setDecisions((prev) => ({
                                    ...prev,
                                    [booking.id]: { action: "link", link_appointment_id: value.slice(5) },
                                  }));
                                } else {
                                  setDecisions((prev) => ({
                                    ...prev,
                                    [booking.id]: {
                                      action: value as DecisionState["action"],
                                      link_appointment_id: null,
                                    },
                                  }));
                                }
                              }}
                            >
                              {preview.duplicate_candidates.map((candidate) => (
                                <option key={candidate.appointment_id} value={`link:${candidate.appointment_id}`}>
                                  Link to existing — {candidate.label} ({formatWhen(candidate.starts_at)})
                                </option>
                              ))}
                              <option value="push">
                                {preview.duplicate_candidates.length > 0
                                  ? "Push anyway — create a second appointment"
                                  : "Push — create the appointment"}
                              </option>
                              <option value="hold">Hold — leave in the queue</option>
                              <option value="skip">Skip</option>
                            </select>
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })}

            <div className="flex gap-2">
              <Button disabled={busy} onClick={() => void runPush()}>
                Confirm push
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => setView("queue")}>
                Back to queue
              </Button>
            </div>
          </div>
        )}

        {view === "results" && (
          <div className="space-y-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Push results</CardTitle>
                <CardDescription>One line per booking — failures show the server's actual reason.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {results.map((result) => {
                    const booking = previewById.get(result.booking_id)?.booking;
                    return (
                      <li key={result.booking_id} className="flex flex-wrap items-start gap-3 py-3">
                        {result.status === "created" && <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600" />}
                        {result.status === "linked" && <Link2 className="mt-0.5 h-4 w-4 text-blue-600" />}
                        {result.status === "skipped" && <MinusCircle className="mt-0.5 h-4 w-4 text-muted-foreground" />}
                        {result.status === "failed" && <XCircle className="mt-0.5 h-4 w-4 text-destructive" />}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{booking?.customer ?? result.booking_id}</span>
                            <Badge
                              variant={
                                result.status === "failed"
                                  ? "destructive"
                                  : result.status === "created"
                                    ? "default"
                                    : "secondary"
                              }
                            >
                              {result.status}
                            </Badge>
                            {result.appointment_id && (
                              <span className="text-xs text-muted-foreground">
                                Appointment {result.appointment_id}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-sm text-muted-foreground">{result.message}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
            <Button
              onClick={() => {
                setResults([]);
                setPreviews([]);
                setView("queue");
              }}
            >
              Back to queue
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

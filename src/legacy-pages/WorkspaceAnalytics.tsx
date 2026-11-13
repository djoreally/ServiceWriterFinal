import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityTimeline } from "@/components/analytics/ActivityTimeline";
import { useWorkspaceSelection } from "@/hooks/useWorkspaceSelection";
import {
  fetchBookingFunnel,
  fetchServiceInsight,
  fetchTelemetryEvents,
  fetchTelemetryUsers,
  type FunnelReport,
  type ServiceInsightRow,
  type TelemetryEventRow,
  type TelemetryWorkspaceUser,
} from "@/application/queries/telemetry.query";

/**
 * Analytics — the shop's own built-in analytics console.
 *
 * Their own Google Analytics / Search Console, inside their own
 * platform, fed by Service Writer's first-party telemetry: the public
 * booking funnel with drop-off at every step, the bookings that got
 * away, cohorts, the services people look at and don't buy, and the
 * team's activity in the app. Owners and admins only — the API and
 * the database both enforce that; this page just renders the answer.
 */

const DAY_OPTIONS = [7, 30, 90] as const;

function minutesLabel(ms: number): string {
  if (!ms) return "0s";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function percent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export default function WorkspaceAnalytics() {
  const { selectedWorkspace, loading: workspaceLoading } = useWorkspaceSelection();
  const workspaceId = selectedWorkspace?.workspace_id ?? null;

  const [days, setDays] = useState<number>(30);
  const [funnel, setFunnel] = useState<FunnelReport | null>(null);
  const [services, setServices] = useState<ServiceInsightRow[]>([]);
  const [users, setUsers] = useState<TelemetryWorkspaceUser[]>([]);
  const [pickedUser, setPickedUser] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<{ userId: string; rows: TelemetryEventRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const [funnelData, serviceData, userData] = await Promise.all([
        fetchBookingFunnel(workspaceId, days),
        fetchServiceInsight(workspaceId, days),
        fetchTelemetryUsers(workspaceId),
      ]);
      setFunnel(funnelData);
      setServices(serviceData);
      setUsers(userData);
    } catch (cause) {
      setError(
        cause instanceof Error && /403|forbidden/i.test(cause.message)
          ? "Analytics is for workspace owners and admins."
          : "Analytics could not be loaded. Try again in a moment.",
      );
    } finally {
      setLoading(false);
    }
  }, [workspaceId, days]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
  }, [load]);

  useEffect(() => {
    if (!workspaceId || !pickedUser) return;
    let active = true;
    void fetchTelemetryEvents(workspaceId, pickedUser)
      .then((rows) => {
        if (active) setTimeline({ userId: pickedUser, rows });
      })
      .catch(() => {
        if (active) setTimeline({ userId: pickedUser, rows: [] });
      });
    return () => {
      active = false;
    };
  }, [workspaceId, pickedUser]);

  return (
    <AppLayout title="Analytics">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold">
              <BarChart3 className="h-5 w-5 text-primary" /> Analytics
            </h1>
            <p className="text-sm text-muted-foreground">
              Your shop&apos;s own built-in analytics — your booking funnel and your team&apos;s activity,
              recorded by Service Writer itself. No outside analytics service sees any of it.
            </p>
          </div>
          <div className="flex gap-2">
            {DAY_OPTIONS.map((option) => (
              <Button
                key={option}
                size="sm"
                variant={days === option ? "default" : "outline"}
                onClick={() => setDays(option)}
              >
                {option}d
              </Button>
            ))}
          </div>
        </div>

        {workspaceLoading || loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : error ? (
          <Card>
            <CardContent className="py-6 text-sm">{error}</CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Booking funnel</CardTitle>
                <CardDescription>
                  {funnel
                    ? `${funnel.totals.journeys} journeys · ${funnel.totals.confirmed} confirmed · ${percent(funnel.totals.conversion_rate)} conversion (last ${days} days)`
                    : "No journeys yet."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {funnel && funnel.totals.journeys > 0 ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="py-1 font-medium">Step</th>
                        <th className="py-1 font-medium">Journeys reached</th>
                        <th className="py-1 font-medium">Dropped from previous</th>
                      </tr>
                    </thead>
                    <tbody>
                      {funnel.steps.map((row) => (
                        <tr key={row.step} className="border-t">
                          <td className="py-1.5 capitalize">{row.step}</td>
                          <td className="py-1.5">{row.sessions}</td>
                          <td className="py-1.5">{row.dropoff_from_previous > 0 ? `−${row.dropoff_from_previous}` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    When customers book on your public pages, every step they take shows up here.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Lost bookings</CardTitle>
                <CardDescription>Journeys that started but never confirmed — and exactly where they stopped.</CardDescription>
              </CardHeader>
              <CardContent>
                {funnel && funnel.lost_bookings.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="py-1 font-medium">Stopped at</th>
                        <th className="py-1 font-medium">Last seen</th>
                        <th className="py-1 font-medium">Came from</th>
                        <th className="py-1 font-medium">Time spent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {funnel.lost_bookings.map((row) => (
                        <tr key={row.session_id} className="border-t">
                          <td className="py-1.5 capitalize">{row.last_step ?? "—"}</td>
                          <td className="py-1.5">{new Date(row.last_seen_at).toLocaleString()}</td>
                          <td className="py-1.5">{row.entry_source}</td>
                          <td className="py-1.5">{minutesLabel(row.engaged_ms)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm text-muted-foreground">No lost bookings in this window.</p>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Cohorts by week</CardTitle>
                  <CardDescription>Journeys started that week, and how many confirmed.</CardDescription>
                </CardHeader>
                <CardContent>
                  {funnel && funnel.cohorts.by_week.length > 0 ? (
                    <table className="w-full text-sm">
                      <tbody>
                        {funnel.cohorts.by_week.map((row) => (
                          <tr key={row.week} className="border-t first:border-t-0">
                            <td className="py-1.5">Week of {row.week}</td>
                            <td className="py-1.5">{row.journeys} journeys</td>
                            <td className="py-1.5">{row.confirmed} confirmed</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-sm text-muted-foreground">Not enough journeys yet.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Cohorts by source</CardTitle>
                  <CardDescription>Where booking journeys enter from.</CardDescription>
                </CardHeader>
                <CardContent>
                  {funnel && funnel.cohorts.by_source.length > 0 ? (
                    <table className="w-full text-sm">
                      <tbody>
                        {funnel.cohorts.by_source.map((row) => (
                          <tr key={row.source} className="border-t first:border-t-0">
                            <td className="py-1.5">{row.source}</td>
                            <td className="py-1.5">{row.journeys} journeys</td>
                            <td className="py-1.5">{row.confirmed} confirmed</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-sm text-muted-foreground">Not enough journeys yet.</p>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Services: looked at, not bought</CardTitle>
                <CardDescription>
                  Which services customers view and compare — and which ones they walk away from.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {services.length > 0 ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="py-1 font-medium">Service</th>
                        <th className="py-1 font-medium">Price</th>
                        <th className="py-1 font-medium">Viewed</th>
                        <th className="py-1 font-medium">Selected</th>
                        <th className="py-1 font-medium">Confirmed</th>
                        <th className="py-1 font-medium">Viewed, not bought</th>
                      </tr>
                    </thead>
                    <tbody>
                      {services.map((row) => (
                        <tr key={row.service_id} className="border-t">
                          <td className="py-1.5">{row.service_name ?? row.service_id}</td>
                          <td className="py-1.5">{row.price !== null ? `$${row.price}` : "—"}</td>
                          <td className="py-1.5">{row.viewed_sessions}</td>
                          <td className="py-1.5">{row.selected_sessions}</td>
                          <td className="py-1.5">{row.confirmed_sessions}</td>
                          <td className="py-1.5">{row.viewed_not_bought_sessions}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm text-muted-foreground">No service views recorded in this window yet.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Team activity</CardTitle>
                <CardDescription>
                  What each person on your team opened and did in the app, in order. Pick a person to read their path.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {users.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No team activity recorded yet.</p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {users.map((user) => (
                        <Button
                          key={user.user_id}
                          size="sm"
                          variant={pickedUser === user.user_id ? "default" : "outline"}
                          onClick={() => setPickedUser(user.user_id)}
                        >
                          {user.user_email ?? user.user_id}
                          {user.role ? ` · ${user.role}` : ""}
                        </Button>
                      ))}
                    </div>
                    {pickedUser ? (
                      <ActivityTimeline rows={timeline?.userId === pickedUser ? timeline.rows : []} />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {users.length} people with recorded activity. Last activity is tracked per person above.
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <p className="text-sm text-muted-foreground">
              Looking for the numbers-only view? <Link className="text-primary hover:underline" to="/reports">Reports</Link> covers
              jobs and money; this page covers people and journeys.
            </p>
          </>
        )}
      </div>
    </AppLayout>
  );
}

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ActivityTimeline } from "@/components/analytics/ActivityTimeline";
import {
  fetchPlatformUserActivity,
  type TelemetryEventRow,
} from "@/application/queries/telemetry.query";

/**
 * Platform-admin per-user activity lookup.
 *
 * Cross-platform: type any user's email and read their recorded path
 * through Service Writer — every screen, click and record they opened,
 * in order, across every workspace. Served by
 * GET /v1/telemetry/platform/user-activity, which requires the
 * platform 'admin' role server-side; this tab only renders the answer.
 */
export function AdminUserActivity() {
  const [email, setEmail] = useState("");
  const [rows, setRows] = useState<TelemetryEventRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const lookup = async () => {
    const target = email.trim();
    if (!target) return;
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchPlatformUserActivity(target));
    } catch (cause) {
      setRows(null);
      setError(cause instanceof Error ? cause.message : "Lookup failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>User activity</CardTitle>
        <CardDescription>
          Built-in telemetry, platform-wide. Enter a user&apos;s email to read their recorded activity —
          screens opened, records viewed, actions taken — in order.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void lookup();
          }}
        >
          <Input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="user@example.com"
            type="email"
            className="max-w-sm"
          />
          <Button type="submit" disabled={loading || !email.trim()}>
            {loading ? "Looking…" : "Look up"}
          </Button>
        </form>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {rows !== null ? (
          rows.length > 0 ? (
            <ActivityTimeline rows={rows} />
          ) : (
            <p className="text-sm text-muted-foreground">No recorded activity for that user yet.</p>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

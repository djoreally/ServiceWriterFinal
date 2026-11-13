import type { TelemetryEventRow } from "@/application/queries/telemetry.query";

/**
 * One person's recorded path, in order: when, what they opened or did,
 * and — for record screens — which record it was. Shared by the
 * workspace Analytics console and the platform-admin activity view.
 */

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function describe(row: TelemetryEventRow): string {
  const entity =
    row.metadata && typeof row.metadata.entity_type === "string"
      ? ` (${row.metadata.entity_type} ${String(row.metadata.entity_id ?? "")})`.trimEnd()
      : "";
  switch (row.event_type) {
    case "pageview":
      return `Opened ${row.title || row.path}${entity}`;
    case "click":
    case "cta_click":
    case "outbound_click":
      return `Clicked ${row.target_text || row.target || "a control"} on ${row.path}`;
    case "page_exit":
      return `Left ${row.title || row.path}`;
    case "engagement":
      return `Looked at ${row.title || row.path} for ${Math.round((row.engaged_ms ?? 0) / 1000)}s`;
    case "scroll":
      return `Scrolled ${row.title || row.path} to ${row.scroll_depth ?? 0}%`;
    case "error":
      return `Hit an error on ${row.path}`;
    default:
      return `${row.event_type}${row.funnel_step ? ` · ${row.funnel_step}` : ""} — ${row.path}`;
  }
}

export function ActivityTimeline({ rows }: { rows: TelemetryEventRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>;
  }
  return (
    <ol className="space-y-2">
      {rows.map((row) => (
        <li key={row.id} className="flex items-baseline gap-3 text-sm">
          <span className="w-28 shrink-0 text-xs text-muted-foreground">{formatTime(row.occurred_at)}</span>
          <span className="min-w-0">
            {describe(row)}
            {row.user_email ? <span className="text-muted-foreground"> — {row.user_email}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

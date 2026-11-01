/**
 * AttentionQueue / AttentionRow (canonical, Total Redesign) — PURE
 * PRESENTATION over server-composed attention items (friction M-1).
 *
 * The server composes the queue: which items exist, their rank order,
 * titles, details, and targets (see the cockpit-rows payload). This
 * component never derives an item from counts or facts of its own. The
 * only client-side decision is the D-A3 presentation cap: 3 rows
 * visible, the rest behind an honest "N more" expander — items are
 * hidden, never dropped or re-ranked.
 */
import { memo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AttentionItem } from "@/application/queries/dashboard-cockpit.query";

export type { AttentionItem };

const VISIBLE_CAP = 3;

const toneDotClass: Record<AttentionItem["tone"], string> = {
  warning: "bg-attention-fg",
  danger: "bg-destructive",
};

export const AttentionRow = memo(function AttentionRow({ item }: { item: AttentionItem }) {
  return (
    <li>
      <Link
        to={item.href}
        className="flex items-start gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span aria-hidden="true" className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", toneDotClass[item.tone])} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold leading-snug text-foreground">{item.title}</span>
          {item.detail && (
            <span className="mt-0.5 block text-sm text-muted-foreground">{item.detail}</span>
          )}
        </span>
        <span className="shrink-0 pt-0.5 text-sm font-semibold text-primary">{item.actionLabel} →</span>
      </Link>
    </li>
  );
});

export const AttentionQueue = memo(function AttentionQueue({ items }: { items: AttentionItem[] }) {
  const [expanded, setExpanded] = useState(false);
  // S3: when the server composes nothing, the section is ABSENT — no
  // empty card, no "all clear" filler.
  if (items.length === 0) return null;

  const visible = expanded ? items : items.slice(0, VISIBLE_CAP);
  const hiddenCount = items.length - visible.length;

  return (
    <Card aria-label="Needs attention">
      <CardHeader className="pb-0">
        <CardTitle>Needs attention</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {visible.map((item) => (
            <AttentionRow key={item.id} item={item} />
          ))}
        </ul>
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mt-1 w-full rounded-lg px-2 py-2 text-left text-sm font-semibold text-primary transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-expanded={expanded}
          >
            {hiddenCount} more
          </button>
        )}
        {expanded && items.length > VISIBLE_CAP && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="mt-1 w-full rounded-lg px-2 py-2 text-left text-sm font-semibold text-primary transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-expanded={expanded}
          >
            Show less
          </button>
        )}
      </CardContent>
    </Card>
  );
});

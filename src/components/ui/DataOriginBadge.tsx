import { Badge } from "@/components/ui/badge";
import { originLabel, isImported } from "@/lib/data-origin";

interface DataOriginBadgeProps {
  origin?: string | null;
  className?: string;
}

/** Renders a small badge only for non-system records (imported / integration). */
export function DataOriginBadge({ origin, className }: DataOriginBadgeProps) {
  const label = originLabel(origin);
  if (!label) return null;

  return (
    <Badge variant="outline" className={`text-xs font-normal ${className ?? ""}`}>
      {label}
    </Badge>
  );
}

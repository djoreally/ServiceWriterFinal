import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";

interface UpcomingItem {
  id: string;
  title: string;
  date: Date | string;
  time?: string;
  vehicle?: string;
  status: "confirmed" | "pending";
}

interface UpcomingSectionProps {
  items: UpcomingItem[];
}

export const UpcomingSection = ({ items }: UpcomingSectionProps) => {
  const navigate = useNavigate();
  const { formatDate: regionalFormatDate, formatTime } = useRegionalSettings();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "confirmed":
        return "bg-gray-500/10 text-gray-600 hover:bg-gray-500/20";
      case "pending":
        return "bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 animate-pulse";
      default:
        return "bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20";
    }
  };
  // determine the next upcoming appointment (earliest active date/time)
  const parseItemDate = (d: Date | string): Date => {
    if (d instanceof Date) return d;
    const parsed = new Date(d);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  };

  const nextItem = items && items.length > 0
    ? items
        .slice()
        .sort((a, b) => {
          const aDateObj = parseItemDate(a.date);
          const bDateObj = parseItemDate(b.date);
          const aTime = new Date(`${format(aDateObj, "yyyy-MM-dd")}T${a.time || "00:00"}`).getTime();
          const bTime = new Date(`${format(bDateObj, "yyyy-MM-dd")}T${b.time || "00:00"}`).getTime();
          return aTime - bTime;
        })[0]
    : null;

  const nextItemDateObj = nextItem ? parseItemDate(nextItem.date) : null;

  return (
    <Card className="border border-border/50">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          Upcoming
        </CardTitle>
        <Button
          variant="link"
          className="text-primary p-0 h-auto"
          onClick={() => navigate("/appointments")}
        >
          View All
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {!nextItem ? (
          <div className="text-center py-6 text-muted-foreground">
            <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No upcoming appointments</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => navigate("/appointments")}
            >
              Schedule One
            </Button>
          </div>
        ) : (
          <div
            key={nextItem.id}
            className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => navigate(`/appointments/${nextItem.id}`)}
          >
            <div className="flex flex-col items-center bg-primary/10 rounded-lg px-3 py-2 min-w-[56px]">
              <span className="text-[10px] font-medium text-primary uppercase">
                {nextItemDateObj ? format(nextItemDateObj, "MMM") : ""}
              </span>
              <span className="text-xl font-bold text-primary">
                {nextItemDateObj ? format(nextItemDateObj, "dd") : ""}
              </span>
            </div>
            <div className="flex-1 min-w-0 pt-1">
              <p className="font-medium text-sm text-foreground truncate">{nextItem.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {nextItem.time ? formatTime(nextItem.time) : (nextItemDateObj ? format(nextItemDateObj, "h:mm a") : "")}
                {nextItem.vehicle && ` • ${nextItem.vehicle}`}
              </p>
              <Badge
                variant="secondary"
                className={`mt-2 text-[10px] px-2 py-0.5 ${getStatusBadge(nextItem.status)}`}
              >
                {nextItem.status.charAt(0).toUpperCase() + nextItem.status.slice(1)}
              </Badge>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

import { useEffect, useState } from "react";
import { Inbox, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  fetchQuoteRequests,
  updateQuoteRequestStatus,
  type QuoteRequest,
} from "@/application/queries/repair-pricing.query";

const STATUSES: QuoteRequest["status"][] = ["new", "contacted", "quoted", "won", "lost"];

const fmt = (n?: number | null) =>
  !n || n <= 0 ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

interface QuoteRequestsInboxProps {
  /** Prefill the quote form from a request. */
  onConvert?: (request: QuoteRequest) => void;
}

/**
 * Inbox of estimate-only requests from the public funnel. Shows the market
 * range snapshot captured at submission so pricing conversations start from
 * the same numbers the visitor saw.
 */
export function QuoteRequestsInbox({ onConvert }: QuoteRequestsInboxProps) {
  const [requests, setRequests] = useState<QuoteRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setRequests(await fetchQuoteRequests());
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleStatus = async (request: QuoteRequest, status: QuoteRequest["status"]) => {
    const { error } = await updateQuoteRequestStatus(request.id, status);
    if (error) {
      toast.error("Could not update the request status.");
      return;
    }
    setRequests((prev) => prev.map((r) => (r.id === request.id ? { ...r, status } : r)));
  };

  const openCount = requests.filter((r) => r.status === "new").length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Inbox className="h-4 w-4 text-primary" />
          Quote requests
          {openCount > 0 && <Badge variant="secondary">{openCount} new</Badge>}
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={load} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-6 text-center">
            <Loader2 className="h-5 w-5 animate-spin mx-auto text-primary" />
          </div>
        ) : requests.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No estimate requests yet. Visitors who choose “Just need a price?” on your booking page land here.
          </p>
        ) : (
          <div className="space-y-3">
            {requests.map((request) => {
              const vehicle = [request.vehicle_year, request.vehicle_make, request.vehicle_model]
                .filter(Boolean)
                .join(" ");
              return (
                <div
                  key={request.id}
                  className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium truncate">
                      {request.repair_title || "Price request"}
                      {vehicle ? ` · ${vehicle}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {request.guest_name || "Visitor"} · {request.guest_email || request.guest_phone || "no contact"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Market {fmt(request.estimate_low)} – {fmt(request.estimate_high)}
                      {request.shop_price ? ` · your price ${fmt(request.shop_price)}` : ""}
                      {` · ${request.source}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={request.status} onValueChange={(v) => handleStatus(request, v as QuoteRequest["status"])}>
                      <SelectTrigger className="h-8 w-[120px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s} value={s} className="text-xs capitalize">
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {onConvert && (
                      <Button size="sm" variant="outline" onClick={() => onConvert(request)}>
                        Build quote
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default QuoteRequestsInbox;

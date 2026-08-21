import { useOfflinePaymentQueue } from "@/hooks/useOfflinePaymentQueue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { WifiOff, Wifi, Clock, Loader2, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { formatCentsAsCurrency } from "@/lib/financialMath";

export const OfflinePaymentIndicator = () => {
  const { queue, isOnline, isProcessing, processQueue, clearQueue, isOfflineQueueEnabled } = useOfflinePaymentQueue();

  // UI visibility mirrors eligibility; hook-level gates enforce dormancy.
  if (!isOfflineQueueEnabled) return null;

  if (queue.length === 0 && isOnline) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={isOnline ? "outline" : "destructive"}
          size="sm"
          className="gap-2"
        >
          {isOnline ? (
            <Wifi className="h-4 w-4" />
          ) : (
            <WifiOff className="h-4 w-4" />
          )}
          {queue.length > 0 && (
            <Badge variant="secondary" className="ml-1">
              {queue.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isOnline ? (
                <Wifi className="h-4 w-4 text-gray-500" />
              ) : (
                <WifiOff className="h-4 w-4 text-red-500" />
              )}
              <span className="font-medium">
                {isOnline ? "Online" : "Offline"}
              </span>
            </div>
            {queue.length > 0 && (
              <Badge variant="outline">
                <Clock className="h-3 w-3 mr-1" />
                {queue.length} queued
              </Badge>
            )}
          </div>

          {!isOnline && (
            <p className="text-sm text-muted-foreground">
              Payments will be automatically processed when you reconnect.
            </p>
          )}

          {queue.length > 0 && (
            <>
              <div className="border-t pt-3 space-y-2 max-h-48 overflow-y-auto">
                {queue.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex justify-between items-center text-sm p-2 bg-muted rounded"
                  >
                    <div>
                      <p className="font-medium">
                        {formatCentsAsCurrency(payment.payload.amount, payment.payload.currency)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {payment.payload.customer_name || "Unknown"} •{" "}
                        {format(new Date(payment.createdAt), "MMM d, h:mm a")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-2">
                {isOnline && (
                  <Button
                    size="sm"
                    onClick={processQueue}
                    disabled={isProcessing}
                    className="flex-1"
                  >
                    {isProcessing ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    Process Now
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={clearQueue}
                  className="gap-1"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear
                </Button>
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default OfflinePaymentIndicator;

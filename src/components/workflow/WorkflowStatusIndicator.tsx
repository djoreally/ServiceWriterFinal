import { Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface WorkflowStatusIndicatorProps {
  isConnected: boolean;
  className?: string;
}

/**
 * Visual indicator showing real-time connection status.
 * Green pulse when connected, red when disconnected.
 */
export function WorkflowStatusIndicator({
  isConnected,
  className,
}: WorkflowStatusIndicatorProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors",
            isConnected
              ? "bg-gray-500/10 text-gray-600 dark:text-gray-400"
              : "bg-red-500/10 text-red-600 dark:text-red-400",
            className
          )}
        >
          {isConnected ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-md bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-md h-2 w-2 bg-gray-500" />
              </span>
              <Wifi className="h-3 w-3" />
              <span className="hidden sm:inline">Live</span>
            </>
          ) : (
            <>
              <span className="h-2 w-2 rounded-md bg-red-500" />
              <WifiOff className="h-3 w-3" />
              <span className="hidden sm:inline">Offline</span>
            </>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {isConnected
          ? "Real-time updates active. Changes will appear automatically."
          : "Real-time updates disconnected. Refresh to see latest changes."}
      </TooltipContent>
    </Tooltip>
  );
}

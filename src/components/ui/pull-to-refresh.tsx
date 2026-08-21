import React, { memo } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PullToRefreshIndicatorProps {
  isRefreshing: boolean;
}

export const PullToRefreshIndicator = memo(function PullToRefreshIndicator({
  isRefreshing,
}: PullToRefreshIndicatorProps) {

  return (
    <div
      className="flex items-center justify-center overflow-hidden transition-all duration-200"
    >
      <div
        className={cn(
          "flex items-center justify-center w-10 h-10 rounded-md bg-primary/10",
          isRefreshing && "animate-pulse"
        )}
      >
        <RefreshCw
          className={cn(
            "w-5 h-5 text-primary transition-transform duration-200",
            isRefreshing && "animate-spin"
          )}
        />
      </div>
    </div>
  );
});

interface PullToRefreshContainerProps {
  children: React.ReactNode;
  containerRef: React.RefObject<HTMLDivElement>;
  isRefreshing: boolean;
  className?: string;
}

export const PullToRefreshContainer = memo(function PullToRefreshContainer({
  children,
  containerRef,
  isRefreshing,
  className,
}: PullToRefreshContainerProps) {
  return (
    <div
      ref={containerRef}
      // Below lg the document scrolls (AppLayout). A nested scroll container here
      // traps touch scrolling and cuts off the last rows on phones.
      className={cn("lg:h-full lg:overflow-y-auto", className)}

    >
      <PullToRefreshIndicator
        isRefreshing={isRefreshing}
      />
      {children}
    </div>
  );
});
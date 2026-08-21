/**
 * Per-route error boundary.
 *
 * Wraps groups of lazy-loaded routes so a crash in one feature area
 * does not blank the entire app.  Shows a friendly recovery UI with
 * a "Try again" button that clears the error state.
 *
 * Stale-chunk errors (a deploy shipped new hashed assets while this tab still
 * holds an old shell) are handled specially: React.lazy caches the rejected
 * promise, so re-rendering can never succeed. Instead we purge the service
 * worker + caches and hard-reload once.
 */
import React, { Component, ErrorInfo, ReactNode } from "react";
import {
  canRecoverFromStaleChunk,
  isStaleChunkError,
  recoverFromStaleChunk,
} from "@/lib/chunkRecovery";

interface Props {
  /** Optional label shown in the error card, e.g. "Fleet OS" */
  section?: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  updating: boolean;
}

class RouteErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false, error: null, updating: false };

  public static getDerivedStateFromError(error: Error): State {
    const updating = isStaleChunkError(error) && canRecoverFromStaleChunk();
    return { hasError: true, error, updating };
  }

  public componentDidCatch(error: Error, info: ErrorInfo) {
    if (isStaleChunkError(error)) {
      // Reload with fresh HTML/assets. If the budget is exhausted the helper
      // returns false and the standard error card stays visible.
      if (recoverFromStaleChunk()) return;
      this.setState({ updating: false });
      return;
    }
    console.error(`[RouteErrorBoundary${this.props.section ? ` — ${this.props.section}` : ""}]`, error, info);
  }

  private handleRetry = () => {
    if (isStaleChunkError(this.state.error)) {
      if (recoverFromStaleChunk()) {
        this.setState({ updating: true });
        return;
      }
      window.location.reload();
      return;
    }
    this.setState({ hasError: false, error: null, updating: false });
  };

  public render() {
    if (this.state.hasError) {
      if (this.state.updating) {
        return (
          <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">
              Updating to the latest version…
            </p>
          </div>
        );
      }

      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8">
          <h2 className="text-xl font-semibold text-foreground">
            {this.props.section
              ? `Something went wrong in ${this.props.section}`
              : "Something went wrong"}
          </h2>
          <p className="max-w-md text-center text-sm text-muted-foreground">
            {this.state.error?.message ?? "An unexpected error occurred."}
          </p>
          <button
            onClick={this.handleRetry}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            {isStaleChunkError(this.state.error) ? "Reload app" : "Try again"}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default RouteErrorBoundary;

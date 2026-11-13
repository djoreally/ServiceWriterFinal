"use client";

import { Component, type ReactNode } from "react";
import ShellSkeleton from "./ShellSkeleton";
import {
  isStaleChunkError,
  recoverFromStaleChunk,
} from "@/lib/chunkRecovery";

interface ShellErrorBoundaryProps {
  children: ReactNode;
}

interface ShellErrorBoundaryState {
  error: Error | null;
  recovering: boolean;
}

/**
 * ShellErrorBoundary — the last line of defense for the app shell.
 *
 * The root layout renders this around BOTH the legacy SPA shell and the App
 * Router children. It is the only boundary positioned to catch the shell
 * bundle's own chunk failing to load — the post-deploy stale-chunk failure
 * that used to leave a blank white page until a manual refresh, because the
 * generic ErrorBoundary lives inside the shell it was meant to protect.
 *
 * Stale-chunk errors run the shared chunk recovery (purge service workers
 * and caches, cache-busted hard reload, attempt-bounded) while the branded
 * skeleton stays on screen. Anything else gets a branded card with a Reload
 * action — never a blank page, never a raw error dump.
 */
export default class ShellErrorBoundary extends Component<
  ShellErrorBoundaryProps,
  ShellErrorBoundaryState
> {
  state: ShellErrorBoundaryState = { error: null, recovering: false };

  static getDerivedStateFromError(error: Error): ShellErrorBoundaryState {
    return { error, recovering: isStaleChunkError(error) };
  }

  componentDidCatch(error: Error) {
    if (!isStaleChunkError(error)) return;
    // Bounded recovery: returns false when the attempt budget is spent, in
    // which case the fallback card below replaces the skeleton.
    if (!recoverFromStaleChunk()) {
      this.setState({ recovering: false });
    }
  }

  render() {
    const { error, recovering } = this.state;
    if (!error) return this.props.children;
    if (recovering) return <ShellSkeleton />;
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <div className="w-full max-w-sm space-y-4 text-center">
          <p className="text-base font-semibold tracking-tight">
            Service Writer
          </p>
          <p className="text-sm text-muted-foreground">
            Something went wrong while loading the app. Reloading usually
            fixes it.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}

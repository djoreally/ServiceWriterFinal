import React, { Component, ErrorInfo, ReactNode } from "react";

import { captureClientError } from "../../lib/sentry";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    // Report to Sentry when a DSN is configured; a strict no-op
    // otherwise (see src/lib/sentry.ts). Never throws.
    captureClientError(error, {
      componentStack: errorInfo.componentStack ?? undefined,
    });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-screen flex flex-col items-center justify-center">
          <h1 className="text-2xl font-bold mb-4">Something went wrong.</h1>
          <p className="text-gray-600">{this.state.error?.message}</p>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
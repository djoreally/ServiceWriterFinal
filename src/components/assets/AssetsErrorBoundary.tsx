import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { logAssetEvent } from "@/lib/assets/logger";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message?: string;
}

export class AssetsErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logAssetEvent("list_failed", {
      reason: error?.message || "render_error",
      stack: info.componentStack?.slice(0, 200) ?? null,
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, message: undefined });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-muted">
          <AlertTriangle className="h-5 w-5 text-muted-foreground" />
        </div>
        <h3 className="text-base font-semibold">Assets temporarily unavailable</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Something went wrong loading your asset library. The rest of the app is unaffected.
        </p>
        <Button variant="outline" size="sm" className="mt-4" onClick={this.handleRetry}>
          Retry
        </Button>
      </div>
    );
  }
}

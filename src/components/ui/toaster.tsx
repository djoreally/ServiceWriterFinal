import { useState } from "react";
import { Bell, History, X } from "lucide-react";

import { useToast } from "@/hooks/use-toast";
import { clearToastHistory, useToastHistory } from "@/lib/toast-history";
import { Button } from "@/components/ui/button";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";

const renderToastText = (value: unknown) => {
  if (value == null || typeof value === "boolean") return null;
  if (typeof value === "string" || typeof value === "number") return String(value);
  return "Notification";
};

export function Toaster() {
  const { toasts } = useToast();
  const history = useToastHistory();
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}

      {history.length > 0 && (
        <div className="fixed bottom-4 left-4 z-[100]">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="gap-2 shadow-lg"
            onClick={() => setHistoryOpen((open) => !open)}
            aria-expanded={historyOpen}
            aria-controls="toast-history-drawer"
          >
            <History className="h-4 w-4" />
            Toast history
            <span className="rounded-md bg-background px-1.5 text-xs">{history.length}</span>
          </Button>
        </div>
      )}

      {historyOpen && (
        <aside
          id="toast-history-drawer"
          className="fixed bottom-16 left-4 z-[100] w-[min(24rem,calc(100vw-2rem))] rounded-lg border bg-card p-4 shadow-xl"
          aria-label="Toast history"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-semibold">
              <Bell className="h-4 w-4" />
              Recent notifications
            </div>
            <div className="flex items-center gap-1">
              <Button type="button" size="sm" variant="ghost" onClick={clearToastHistory}>Clear</Button>
              <Button type="button" size="icon" variant="ghost" onClick={() => setHistoryOpen(false)} aria-label="Close toast history">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {history.map((item) => (
              <div key={`${item.id}-${item.createdAt}`} className="rounded-md border bg-background/60 p-3 text-sm">
                <div className="font-medium">{renderToastText(item.title) ?? renderToastText(item.description) ?? "Notification"}</div>
                {item.title && item.description && <div className="text-muted-foreground">{renderToastText(item.description)}</div>}
                <time className="mt-1 block text-xs text-muted-foreground" dateTime={item.createdAt}>
                  {new Date(item.createdAt).toLocaleString()}
                </time>
              </div>
            ))}
          </div>
        </aside>
      )}
      <ToastViewport />
    </ToastProvider>
  );
}

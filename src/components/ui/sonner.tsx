/* eslint-disable react-refresh/only-export-components */
import type { ComponentProps } from "react";
import { Toaster as Sonner, toast as sonnerToast } from "sonner";
import { useTheme } from "@/hooks/useTheme";
import { addToastHistoryItem, getToastHistory } from "@/lib/toast-history";

type ToasterProps = ComponentProps<typeof Sonner>;
type ToastOptions = Parameters<typeof sonnerToast>[1] & { dedupeKey?: string };
type ToastMessage = Parameters<typeof sonnerToast>[0];

const recentToastKeys = new Map<string, number>();
const DEDUPE_WINDOW_MS = 2500;

export { getToastHistory };

const stringifyMessage = (value: unknown) =>
  typeof value === "string" ? value : value instanceof Error ? value.message : String(value ?? "");

const makeDedupeKey = (method: string, title: ToastMessage, description?: unknown, explicit?: string) =>
  explicit ?? `${method}:${stringifyMessage(title)}:${stringifyMessage(description)}`;

const recordAndShow = (method: string, title: ToastMessage, options: ToastOptions = {}) => {
  const { dedupeKey, description, ...toastOptions } = options;
  const key = makeDedupeKey(method, title, description, dedupeKey);
  const now = Date.now();
  const lastSeen = recentToastKeys.get(key) ?? 0;
  if (now - lastSeen < DEDUPE_WINDOW_MS) return undefined;

  recentToastKeys.set(key, now);
  addToastHistoryItem({
    id: `${now}-${key}`,
    title: stringifyMessage(title),
    description: typeof description === "string" ? description : undefined,
    createdAt: new Date(now).toISOString(),
  });

  const variant = sonnerToast[method as keyof typeof sonnerToast];
  if (typeof variant === "function") {
    return (variant as (message: ToastMessage, options?: ToastOptions) => unknown)(title, {
      description,
      ...toastOptions,
    });
  }
  return sonnerToast(title, { description, ...toastOptions });
};

export const notify = (title: string, options: ToastOptions = {}) => recordAndShow("default", title, options);

export const toast = Object.assign(
  (title: ToastMessage, options?: ToastOptions) => recordAndShow("default", title, options),
  {
    success: (title: ToastMessage, options?: ToastOptions) => recordAndShow("success", title, options),
    error: (title: ToastMessage, options?: ToastOptions) => recordAndShow("error", title, options),
    info: (title: ToastMessage, options?: ToastOptions) => recordAndShow("info", title, options),
    message: (title: ToastMessage, options?: ToastOptions) => recordAndShow("message", title, options),
    warning: (title: ToastMessage, options?: ToastOptions) => recordAndShow("warning", title, options),
    loading: (title: ToastMessage, options?: ToastOptions) => recordAndShow("loading", title, options),
    promise: sonnerToast.promise,
    dismiss: sonnerToast.dismiss,
    custom: sonnerToast.custom,
  },
);

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };

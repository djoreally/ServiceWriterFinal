/* eslint-disable react-refresh/only-export-components */
import type { ComponentProps } from "react";
import { Toaster as Sonner, toast } from "sonner";
import { useTheme } from "@/hooks/useTheme";
import { addToastHistoryItem, getToastHistory } from "@/lib/toast-history";

type ToasterProps = ComponentProps<typeof Sonner>;

const recentToastKeys = new Map<string, number>();

export { getToastHistory };

export const notify = (title: string, options: Parameters<typeof toast>[1] & { dedupeKey?: string } = {}) => {
  const { dedupeKey = title, description, ...toastOptions } = options;
  const now = Date.now();
  const lastSeen = recentToastKeys.get(dedupeKey) ?? 0;

  if (now - lastSeen < 2500) return undefined;
  recentToastKeys.set(dedupeKey, now);
  addToastHistoryItem({
    id: `${now}-${dedupeKey}`,
    title,
    description: typeof description === "string" ? description : undefined,
    createdAt: new Date(now).toISOString(),
  });

  return toast(title, { description, ...toastOptions });
};

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

export { Toaster, toast };

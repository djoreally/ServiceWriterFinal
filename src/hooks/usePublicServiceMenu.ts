/**
 * usePublicServiceMenu — loads the resolved public Service Menu for a
 * shop's booking slug.
 *
 * Returns null when the shop has no menu enabled or the load fails —
 * callers render no menu in that case and the booking page keeps its
 * current behavior.
 */
import { useEffect, useState } from "react";
import { fetchPublicServiceMenu } from "@/application/queries/service-menu.query";
import type { ResolvedMenu } from "@/lib/service-menu/menu";

export function usePublicServiceMenu(
  slug: string | undefined,
): ResolvedMenu | null {
  const [menu, setMenu] = useState<ResolvedMenu | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    fetchPublicServiceMenu(slug)
      .then((data) => {
        if (!cancelled) setMenu(data);
      })
      .catch(() => {
        if (!cancelled) setMenu(null);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return menu;
}

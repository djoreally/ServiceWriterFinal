"use client";

import { usePathname } from "next/navigation";
import { useSeoSync } from "./useSeoSync";

/**
 * Next.js App Router equivalent of the `SeoManager` in `src/App.tsx`.
 * Mount once in the `(app)` route-group layout; the SEO table and DOM
 * behavior are shared via `useSeoSync`, so both shells stay identical.
 */
export function NextSeoManager() {
  const pathname = usePathname();
  useSeoSync(pathname ?? "/");
  return null;
}

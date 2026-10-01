"use client";

import type { ReactNode } from "react";
import { TenantPublicShell } from "@/components/routing/TenantPublicShell";

/**
 * Route-group layout for ALL migrated public routes (no URL impact).
 * Self-sufficient: `ClientOnlyShell` renders null on migrated paths, so this
 * layout carries the full provider stack these pages need via the single
 * shared `TenantPublicShell` — never duplicated per page.
 */
export default function TenantGroupLayout({ children }: { children: ReactNode }) {
  return <TenantPublicShell>{children}</TenantPublicShell>;
}

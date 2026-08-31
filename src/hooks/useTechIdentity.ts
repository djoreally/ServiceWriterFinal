/**
 * useTechIdentity — Resolves current user's technician identity
 * 
 * Uses the canonical server context. Owners get a non-mutating preview;
 * technicians receive explicit linked/locked/deactivated/unlinked states.
 * 
 * ⚡ Performance: Uses cached session, called once at layout level.
 */

import { useState, useEffect, useCallback } from "react";
import { fetchTechnicianAppContext } from "@/application/queries/tech-app.query";

export interface TechIdentity {
  techId: string;
  name: string;
  status: string;
  isAdmin: boolean;
  isClockedIn: boolean;
  userId: string;
  /** Business owner's user_id — all appointments are keyed to this */
  businessUserId: string;
  accessState: string;
  presenceState: string;
  role: string;
  vanId: string | null;
  vanName: string | null;
  dataFreshAt: string;
}

export function useTechIdentity() {
  const [identity, setIdentity] = useState<TechIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const resolve = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const context = await fetchTechnicianAppContext();
      setIdentity({
        techId: context.technician_id || "",
        name: context.technician_name || "Technician",
        status: context.field_status || context.presence_state,
        isAdmin: context.is_admin_preview,
        isClockedIn: Boolean(context.shift_id),
        userId: context.user_id,
        businessUserId: context.workspace_user_id,
        accessState: context.access_state,
        presenceState: context.presence_state,
        role: context.role,
        vanId: context.van_id,
        vanName: context.van_name,
        dataFreshAt: context.data_fresh_at,
      });
    } catch (contextError) {
      setIdentity(null);
      setError(contextError instanceof Error ? contextError.message : "Technician context could not be loaded");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void Promise.resolve().then(() => resolve()); }, [resolve]);

  return { identity, loading, error, refetch: resolve };
}

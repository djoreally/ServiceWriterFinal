/**
 * useRealtimeTechLocations — Subscribes to live technician location & status changes.
 *
 * Performance: Only processes UPDATE events with location or status field changes.
 */

import { useEffect, useRef, useCallback } from "react";
import {
  subscribeTechLocations,
  type TechLocationUpdate,
} from "@/application/queries/realtime-tech-locations.query";
import { isValidLatLng, normalizeTechnicianStatus } from "@/lib/dispatch-state";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface UseRealtimeTechLocationsOptions {
  userId?: string;
  onLocationUpdate?: (update: TechLocationUpdate) => void;
  onStatusChange?: (techId: string, newStatus: string) => void;
  enabled?: boolean;
}

export function useRealtimeTechLocations({
  userId,
  onLocationUpdate,
  onStatusChange,
  enabled = true,
}: UseRealtimeTechLocationsOptions) {
  const subRef = useRef<{ channel: RealtimeChannel; unsubscribe: () => void } | null>(null);

  const cleanup = useCallback(() => {
    if (subRef.current) {
      subRef.current.unsubscribe();
      subRef.current = null;
    }
  }, []);

  const handleLocationUpdate = useCallback(
    (update: TechLocationUpdate) => {
      if (!isValidLatLng(update.lat, update.lng)) {
        return;
      }

      const normalizedStatus = update.status
        ? normalizeTechnicianStatus(update.status)
        : undefined;

      onLocationUpdate?.({
        techId: update.techId,
        lat: update.lat,
        lng: update.lng,
        status: normalizedStatus,
      });

      if (normalizedStatus) {
        onStatusChange?.(update.techId, normalizedStatus);
      }
    },
    [onLocationUpdate, onStatusChange]
  );

  const handleStatusChange = useCallback(
    (techId: string, newStatus: string) => {
      onStatusChange?.(techId, normalizeTechnicianStatus(newStatus));
    },
    [onStatusChange]
  );

  useEffect(() => {
    if (!enabled || !userId) {
      cleanup();
      return;
    }

    if (subRef.current) return;

    subRef.current = subscribeTechLocations({
      userId,
      onLocationUpdate: handleLocationUpdate,
      onStatusChange: handleStatusChange,
    });

    return cleanup;
  }, [cleanup, enabled, handleLocationUpdate, handleStatusChange, userId]);
}

export type { TechLocationUpdate };

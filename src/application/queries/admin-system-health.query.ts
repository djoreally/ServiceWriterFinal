/**
 * Admin System Health Query
 * Checks database, auth, and storage health via lightweight probes.
 */
import { supabase } from "@/integrations/supabase/client";

export interface HealthStatus {
  database: "healthy" | "degraded" | "down";
  auth: "healthy" | "degraded" | "down";
  storage: "healthy" | "degraded" | "down";
  edgeFunctions: "healthy" | "degraded" | "down";
}

export interface SystemMetrics {
  databaseLatency: number;
  authLatency: number;
  activeConnections: number;
  storageUsed: number;
  lastChecked: Date;
}

export async function checkSystemHealth(): Promise<{ health: HealthStatus; metrics: Omit<SystemMetrics, 'activeConnections'> }> {
  // Database probe
  const dbStart = Date.now();
  const { error: dbError } = await supabase
    .from("platform_settings")
    .select("id")
    .limit(1);
  const dbLatency = Date.now() - dbStart;

  // Auth probe
  const authStart = Date.now();
  const { error: authError } = await supabase.auth.getSession();
  const authLatency = Date.now() - authStart;

  // Storage probe
  const { data: buckets, error: storageError } = await supabase.storage.listBuckets();

  return {
    health: {
      database: dbError ? "down" : dbLatency > 500 ? "degraded" : "healthy",
      auth: authError ? "down" : authLatency > 500 ? "degraded" : "healthy",
      storage: storageError ? "down" : "healthy",
      edgeFunctions: "healthy",
    },
    metrics: {
      databaseLatency: dbLatency,
      authLatency: authLatency,
      storageUsed: buckets?.length || 0,
      lastChecked: new Date(),
    },
  };
}

/**
 * Admin System Health Query
 * Checks database, auth, and storage health via lightweight probes.
 */
import { apiClient } from "@/lib/api-client";

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

interface SystemHealthResponse {
  health: HealthStatus;
  metrics: {
    databaseLatency: number;
    authLatency: number;
    storageUsed: number;
    lastChecked: string;
  };
}

export async function checkSystemHealth(): Promise<{ health: HealthStatus; metrics: Omit<SystemMetrics, 'activeConnections'> }> {
  const { health, metrics } = await apiClient.get<SystemHealthResponse>(
    "/v1/platform/system-health",
  );
  return {
    health,
    metrics: {
      databaseLatency: metrics.databaseLatency,
      authLatency: metrics.authLatency,
      storageUsed: metrics.storageUsed,
      lastChecked: new Date(metrics.lastChecked),
    },
  };
}

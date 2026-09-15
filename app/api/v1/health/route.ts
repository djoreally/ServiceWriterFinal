import { json } from "@/server/api";
import { createSupabaseServerClient } from "@/lib/supabase";

export async function GET() {
  const startTime = Date.now();
  let dbStatus = "unknown";
  let dbLatencyMs = -1;

  try {
    const supabase = await createSupabaseServerClient();
    const dbStart = Date.now();
    const { error } = await supabase.from("workspaces").select("id").limit(1);
    dbLatencyMs = Date.now() - dbStart;
    dbStatus = error ? "degraded" : "healthy";
  } catch {
    dbStatus = "unreachable";
  }

  const isHealthy = dbStatus === "healthy" || dbStatus === "degraded";

  return json(
    {
      status: isHealthy ? "healthy" : "unhealthy",
      service: "servicewriter-api",
      version: process.env.NEXT_PUBLIC_APP_VERSION || "1.0.0",
      timestamp: new Date().toISOString(),
      uptimeSeconds: process.uptime(),
      checks: {
        database: {
          status: dbStatus,
          latencyMs: dbLatencyMs,
        },
      },
      responseTimeMs: Date.now() - startTime,
    },
    {
      status: isHealthy ? 200 : 503,
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    }
  );
}

import type { NextConfig } from "next";
import path from "node:path";

const publicMapboxToken = process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN || process.env.VITE_MAPBOX_PUBLIC_TOKEN || "";
const publicSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://rjfbrfognxqkyhdrpibx.supabase.co";
const publicSupabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_-TAyW6MChnKyB_0yICU79g_miXrX3xy";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  outputFileTracingIncludes: {
    "/api/v1/public-vehicle-catalog": [
      "./data/vehicle-catalog-staging/vehicle_specifications_import_eligible_verified.csv",
    ],
  },
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: false,
  env: {
    NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN: publicMapboxToken,
    NEXT_PUBLIC_SUPABASE_URL: publicSupabaseUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicSupabaseKey,
  },
};

export default nextConfig;

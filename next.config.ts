import type { NextConfig } from "next";
import path from "node:path";

const publicMapboxToken = process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN || process.env.VITE_MAPBOX_PUBLIC_TOKEN || "";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: false,
  env: {
    NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN: publicMapboxToken,
  },
};

export default nextConfig;

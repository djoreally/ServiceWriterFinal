import type { NextConfig } from "next";
import path from "node:path";

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
};

export default nextConfig;

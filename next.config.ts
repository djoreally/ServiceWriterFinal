/**
 * AI TERRITORY: OWNER-GATED — see docs/ai-territory.md.
 * No agent changes without Ty's explicit word.
 */
import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // ssh2 (via ssh2-sftp-client, used by the Carfax SFTP transfer) loads a
  // native addon (sshcrypto.node). Turbopack cannot place .node assets in
  // ESM chunks, which broke production builds once the addon existed in
  // the install (Vercel builds it; it is optional at runtime — ssh2
  // falls back to pure JS). Keep both packages external so Node loads
  // them at runtime instead of the bundler tracing them.
  serverExternalPackages: ["ssh2", "ssh2-sftp-client"],
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

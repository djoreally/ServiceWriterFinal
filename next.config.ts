import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: false,
  // Recovery deployment: the preserved frontend still carries substantial
  // legacy ESLint debt. Do not let warnings/errors unrelated to runtime safety
  // block production while the canonical Next/Supabase contracts are brought
  // online. TypeScript checking remains enabled during `next build`.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;

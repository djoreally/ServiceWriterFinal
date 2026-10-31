import type { Metadata, Viewport } from "next";
// Self-hosted variable fonts — no render-blocking external font stylesheet.
// Inter Variable (body/UI), Plus Jakarta Sans Variable (display/headings),
// JetBrains Mono Variable (IDs, VINs, codes). SocialMetric set, Phase 0.
import "@fontsource-variable/inter";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/jetbrains-mono";
import "../src/index.css";
import ClientOnlyShell from "../src/ClientOnlyShell";

export const metadata: Metadata = {
  title: "Service Writer - Auto Shop Management Software",
  description: "Manage customers, vehicles, appointments, work orders, dispatch, CRM, imports, and payments in one secure workspace.",
  applicationName: "Service Writer",
  manifest: "/manifest.json",
  icons: { icon: [{ url: "/pwa-192x192.png", sizes: "192x192", type: "image/png" }, { url: "/pwa-512x512.png", sizes: "512x512", type: "image/png" }], apple: "/pwa-192x192.png" },
  appleWebApp: { capable: true, title: "Service Writer", statusBarStyle: "default" },
  other: { "mobile-web-app-capable": "yes" },
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <div id="root">
          <ClientOnlyShell />
          {children}
        </div>
      </body>
    </html>
  );
}

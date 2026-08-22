import type { Metadata, Viewport } from "next";
import "../src/index.css";
import ClientOnlyShell from "../src/ClientOnlyShell";

export const metadata: Metadata = {
  title: "Service Writer - Auto Shop Management Software",
  description: "Manage customers, vehicles, appointments, work orders, dispatch, CRM, imports, and payments in one secure workspace.",
  applicationName: "Service Writer",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f172a",
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

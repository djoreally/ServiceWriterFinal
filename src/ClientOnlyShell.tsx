"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

const BrowserApplication = dynamic(() => import("./NextClientShell"), {
  ssr: false,
  loading: () => <div aria-label="Loading Service Writer" className="min-h-screen bg-background" />,
});

const NATIVE_PUBLIC_ROUTES = new Set(["/tire", "/detailers"]);

export default function ClientOnlyShell() {
  const pathname = usePathname();
  if (NATIVE_PUBLIC_ROUTES.has(pathname)) return null;
  return <BrowserApplication />;
}

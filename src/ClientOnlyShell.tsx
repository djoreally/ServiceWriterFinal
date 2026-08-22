"use client";

import dynamic from "next/dynamic";

const BrowserApplication = dynamic(() => import("./NextClientShell"), {
  ssr: false,
  loading: () => <div aria-label="Loading Service Writer" className="min-h-screen bg-background" />,
});

export default function ClientOnlyShell() {
  return <BrowserApplication />;
}

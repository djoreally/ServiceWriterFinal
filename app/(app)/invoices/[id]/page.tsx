"use client";
import { Routes, Route, Navigate, useParams } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { RequireAuth } from "@/components/routing/legacy-guards";

// Item #9 Step 3 (CHAIR-1): /invoices/:id has no detail page of its own — the
// invoice detail UX is the list's InvoiceDetailDialog. The deep link redirects
// to the list carrying ?view=<id>; the Invoices tab consumes the param and
// opens the dialog for that invoice (and lands plainly if the id is unknown).
// <Navigate> inside the adapter becomes nextRouter.replace — do NOT rewrite
// with next/navigation redirect().
function InvoiceDeepLinkRedirect() {
  const { id } = useParams();
  return <Navigate to={`/invoices?view=${encodeURIComponent(id ?? "")}`} replace />;
}

export default function InvoiceDeepLinkPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/invoices/:id" element={<RequireAuth><InvoiceDeepLinkRedirect /></RequireAuth>} />
      </Routes>
    </NextRouterAdapter>
  );
}

"use client";
import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import { RequireAuth } from "@/components/routing/legacy-guards";
import RouteErrorBoundary from "@/shared/errors/RouteErrorBoundary";
// direct imports (no lazyRetry — App Router code-splits per route)
import TechAppLayout from "@/legacy-pages/tech-app/TechAppLayout";
import TechToday from "@/legacy-pages/tech-app/TechToday";
import TechJobs from "@/legacy-pages/tech-app/TechJobs";
import TechFleet from "@/legacy-pages/tech-app/TechFleet";
import TechJobDetail from "@/legacy-pages/tech-app/TechJobDetail";
import TechDataCenter from "@/legacy-pages/tech-app/TechDataCenter";
import TechRoute from "@/legacy-pages/tech-app/TechRoute";
import TechNavigation from "@/legacy-pages/tech-app/TechNavigation";
import TechMessages from "@/legacy-pages/tech-app/TechMessages";
import TechMore from "@/legacy-pages/tech-app/TechMore";
import TechInventory from "@/legacy-pages/tech-app/TechInventory";
import TechShift from "@/legacy-pages/tech-app/TechShift";
import TechShiftReview from "@/legacy-pages/tech-app/TechShiftReview";
import TechProfile from "@/legacy-pages/tech-app/TechProfile";
import TechSettings from "@/legacy-pages/tech-app/TechSettings";
import TechServices from "@/legacy-pages/tech-app/TechServices";

export default function TechAppPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/tech-app" element={<RequireAuth><RouteErrorBoundary section="Tech App"><TechAppLayout /></RouteErrorBoundary></RequireAuth>}>
          <Route index element={<TechToday />} />
          <Route path="jobs" element={<TechJobs />} />
          <Route path="fleet" element={<TechFleet />} />
          <Route path="jobs/:jobId" element={<TechJobDetail />} />
          <Route path="data-center" element={<TechDataCenter />} />
          <Route path="route" element={<TechRoute />} />
          <Route path="navigate/:jobId" element={<TechNavigation />} />
          <Route path="messages" element={<TechMessages />} />
          <Route path="more" element={<TechMore />} />
          <Route path="inventory" element={<TechInventory />} />
          <Route path="shift" element={<TechShift />} />
          <Route path="shift-review" element={<TechShiftReview />} />
          <Route path="profile" element={<TechProfile />} />
          <Route path="settings" element={<TechSettings />} />
          <Route path="services" element={<TechServices />} />
        </Route>
      </Routes>
    </NextRouterAdapter>
  );
}

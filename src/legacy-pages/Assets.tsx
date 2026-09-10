import { lazy, Suspense } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { AssetsErrorBoundary } from "@/components/assets/AssetsErrorBoundary";
import { AssetsLoading } from "@/components/assets/AssetsLoading";

const AssetsPage = lazy(() =>
  import("@/components/assets/AssetsPage").then((m) => ({ default: m.AssetsPage })),
);

export default function Assets() {
  return (
    <AppLayout>
      <div className="w-full py-2 sm:py-3">
        <AssetsErrorBoundary>
          <Suspense fallback={<AssetsLoading />}>
            <AssetsPage />
          </Suspense>
        </AssetsErrorBoundary>
      </div>
    </AppLayout>
  );
}

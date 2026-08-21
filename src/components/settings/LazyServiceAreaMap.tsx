import { lazy, Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

const ServiceAreaMap = lazy(() => 
  import('./ServiceAreaMap').then(module => ({ default: module.ServiceAreaMap }))
);

interface LazyServiceAreaMapProps {
  coordinates: { lat: number; lng: number } | null;
  radiusMiles: number;
}

export const LazyServiceAreaMap = ({ coordinates, radiusMiles }: LazyServiceAreaMapProps) => {
  return (
    <Suspense fallback={<Skeleton className="h-48 w-full rounded-lg" />}>
      <ServiceAreaMap coordinates={coordinates} radiusMiles={radiusMiles} />
    </Suspense>
  );
};

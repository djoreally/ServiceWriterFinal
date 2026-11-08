import ShellSkeleton from "@/components/routing/ShellSkeleton";

/**
 * First paint for every migrated (app) route (§3.2.1 R2: no blank page).
 * The App Router streams this branded skeleton while the route segment
 * loads — initial navigation included — instead of leaving a blank white
 * viewport until the client bundle and auth state resolve.
 */
export default function Loading() {
  return <ShellSkeleton />;
}

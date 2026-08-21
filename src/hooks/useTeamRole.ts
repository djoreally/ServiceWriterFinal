import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@packages/auth";
import { fetchWorkforceIdentity, type WorkforceMembership, type WorkforceRole } from "@/application/queries/workforce-identity.query";
import { isTransientBackendError } from "@/lib/transient-backend";
export type TeamRole = WorkforceRole;
interface UseTeamRoleResult {
  role: TeamRole | null;
  loading: boolean;
  ownerUserId: string | null;
  memberships: WorkforceMembership[];
  /** The identity read failed (backend fault) rather than returning no role. */
  error: unknown;
  /** Re-runs the identity read; used by the non-blocking shell banner. */
  retry: () => void;
}
export function useTeamRole(): UseTeamRoleResult {
  const { session, loading: authLoading } = useAuth(); const userId = session?.user?.id ?? null;
  // `fetchWorkforceIdentity` already retries transient backend faults internally.
  // Retrying a *non*-transient failure here only delays the fallback, so the
  // query layer retries transient errors twice more and gives up immediately on
  // anything real (missing role, permission denied on a resolved schema).
  const query = useQuery({
    queryKey: ["workforce-identity", userId],
    queryFn: fetchWorkforceIdentity,
    enabled: !authLoading && Boolean(userId),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => failureCount < 2 && isTransientBackendError(error as never),
    retryDelay: (attempt) => 400 * 2 ** attempt,
  });
  const retry = () => { void query.refetch(); };
  if (authLoading || (userId && query.isLoading)) return { role: null, loading: true, ownerUserId: null, memberships: [], error: null, retry };
  if (!userId || query.isError || !query.data?.length) {
    return { role: null, loading: false, ownerUserId: null, memberships: [], error: query.isError ? query.error : null, retry };
  }
  const active = query.data.find((membership) => membership.isDefault) ?? query.data[0];
  return { role: active.role, loading: false, ownerUserId: active.workspaceUserId, memberships: query.data, error: null, retry };
}

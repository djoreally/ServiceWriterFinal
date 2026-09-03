interface ResolveStartupRouteArgs {
  isAuthenticated: boolean;
  currentPath: string;
  persistedIntendedPath: string | null;
  role?: string | null;
  requiresOnboarding?: boolean;
  requiresPlan?: boolean;
}

/**
 * Generic startup routes the app shell is allowed to redirect away from.
 *
 * `/login/*` variant pages (business / dispatch / technician / magic-link)
 * are deliberately EXCLUDED: `WorkforceAuth` is the single routing authority
 * on those paths because only it knows which portal the user picked. When
 * both layers could navigate, the app shell won the race with a stale role
 * and bounced dispatch/office staff into the technician app.
 */
const STARTUP_DECISION_PATHS = new Set(["/", "/auth", "/onboarding", "/login", "/signup", "/plans"]);
const ALLOWED_PERSISTED_STARTUP_PATHS = new Set(["/plans"]);

export function isStartupDecisionPath(pathname: string): boolean {
  return STARTUP_DECISION_PATHS.has(pathname);
}

export function resolveStartupRoute({
  isAuthenticated,
  currentPath,
  persistedIntendedPath,
  role,
  requiresOnboarding = false,
  requiresPlan = false,
}: ResolveStartupRouteArgs): string {
  // 1) Anonymous users stay on the requested route. Public routes (notably
  // the homepage) render normally, while protected routes are redirected by
  // their own RequireAuth wrappers instead of making /auth the startup page.
  if (!isAuthenticated) return currentPath;

  // 2) Staff roles resolve BEFORE the owner gates. Onboarding and plan
  // selection are workspace-owner concerns — team members never own a
  // subscription, so funnelling them through requiresPlan/requiresOnboarding
  // would strand dispatchers on /plans for a plan they cannot buy. The
  // server-side gate (gate-app-access) already exempts team members; this
  // keeps the client consistent with it.

  // Technicians should never default into the owner/admin dashboard or the
  // retired team dashboard. Preserve current field-app deep links, but send all
  // generic/legacy startup routes to the active technician app.
  if (role === "technician") {
    const isTechnicianPath =
      currentPath === "/tech-app" ||
      currentPath.startsWith("/tech-app/");
    if (isTechnicianPath) return currentPath;
    return "/tech-app";
  }

  // Dispatchers and managers live on the dispatch board. Concrete deep links
  // are preserved (RequireAuth + access-policy remain the authorization
  // boundary); only generic startup routes land on the board.
  if (role === "dispatcher" || role === "manager") {
    if (!isStartupDecisionPath(currentPath)) return currentPath;
    return "/dispatch";
  }

  // Fleet managers land in Fleet OS, which is their canonical authorized home.
  if (role === "fleet_manager") {
    if (!isStartupDecisionPath(currentPath)) return currentPath;
    return "/fleet-os";
  }

  // 3) Owner gates (admin / unresolved owner identity).
  if (requiresOnboarding) {
    return currentPath === "/onboarding" ? currentPath : "/onboarding";
  }

  if (requiresPlan) {
    return currentPath === "/plans" ? currentPath : "/plans";
  }

  // 4) Preserve deep links for authenticated users.
  const isDeepLink = !isStartupDecisionPath(currentPath);
  if (isDeepLink) return currentPath;

  // 5) Persisted startup destinations are intentionally narrow. A stale value
  // like /settings must never become the app's default landing screen.
  if (persistedIntendedPath && ALLOWED_PERSISTED_STARTUP_PATHS.has(persistedIntendedPath)) {
    return persistedIntendedPath;
  }

  // 6) Default startup route
  return "/dashboard";
}

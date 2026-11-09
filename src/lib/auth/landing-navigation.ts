import type { NavigateFunction } from "react-router-dom";
import { requiresDocumentNavigation } from "@/lib/migratedRoutes";

/**
 * The one browser effect this module needs. Wrapped in an object so tests
 * can spy on it: jsdom's `window.location` is unforgeable and its methods
 * are read-only, so `location.replace` cannot be stubbed directly.
 */
export const documentNavigation = {
  replace(target: string): void {
    window.location.replace(target);
  },
};

/**
 * Perform a post-login landing from inside the legacy SPA shell.
 *
 * The landing decision points (`WorkforceAuth` after sign-in, and the
 * startup navigator in `useStartupNavigation`) resolve a destination and
 * hand it here. When the destination is owned by an App Router page,
 * react-router's client-side navigation cannot get the user there: it
 * rewrites the address in place, the SPA unmounts for the migrated path,
 * and no App Router page is ever loaded — the visit strands on a blank
 * page until a manual reload (see `requiresDocumentNavigation`). A real
 * document navigation (`location.replace`, matching the replace semantics
 * of the landing) boots the shell that owns the URL.
 *
 * Destinations the SPA itself owns keep the client-side navigation, so
 * in-shell landings (e.g. `/plans`) stay instant.
 */
export function navigatePostLogin(navigate: NavigateFunction, target: string): void {
  if (requiresDocumentNavigation(target)) {
    documentNavigation.replace(target);
    return;
  }
  navigate(target, { replace: true });
}

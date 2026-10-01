"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  Router,
  createPath,
  useInRouterContext,
  type Location,
  type Navigator,
  type To,
} from "react-router-dom";
import { usePathname, useRouter as useNextRouter, useSearchParams } from "next/navigation";

/**
 * Bridges react-router-dom v7 to Next.js App Router navigation so legacy page
 * components keep working UNCHANGED: `useNavigate`, `Link`, `useParams`,
 * `useLocation`, `useSearchParams` (react-router's), and `<Navigate>` all
 * behave as they did under the SPA's `BrowserRouter`.
 *
 * Implementation: react-router's low-level `<Router>` is driven by a
 * `location` built from Next's `usePathname()` + `useSearchParams()` (+ the
 * window hash, synced post-mount), while a custom `Navigator` forwards
 * `push`/`replace` to Next's router and `go` to `window.history`.
 *
 * Idempotency: if an adapter is already mounted above (the `(app)`
 * route-group layout provides one for its chrome), this renders children
 * directly instead of nesting routers — react-router forbids nested `<Router>`.
 */

/**
 * Navigation-state shim. Next.js navigation has no `location.state`, so state
 * passed via react-router `navigate(to, { state })` / `<Navigate state>` is
 * stored here keyed by destination href and exposed as `location.state`.
 * Read without deleting on render is fine; entries are overwritten on every
 * push/replace to the same href, mirroring history-entry semantics.
 */
const navigationState = new Map<string, unknown>();

const hrefFor = (to: To): string => (typeof to === "string" ? to : createPath(to));

export interface AdapterLocationInput {
  pathname: string;
  search?: string;
  hash?: string;
}

/** Builds the react-router `Location` the adapter feeds to `<Router>`. */
export const buildAdapterLocation = ({
  pathname,
  search = "",
  hash = "",
}: AdapterLocationInput): Location => {
  const href = `${pathname}${search}${hash}`;
  return {
    pathname,
    search,
    hash,
    state: navigationState.get(href) ?? null,
    key: "default",
  };
};

function subscribeHashChange(callback: () => void): () => void {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

const getHashSnapshot = (): string => window.location.hash;
const getHashServerSnapshot = (): string => "";

function useAdapterNavigator(): Navigator {
  const nextRouter = useNextRouter();
  return useMemo<Navigator>(
    () => ({
      createHref: (to: To) => hrefFor(to),
      go: (delta: number) => {
        if (typeof window !== "undefined") {
          window.history.go(delta);
        }
      },
      push: (to: To, state?: unknown) => {
        const href = hrefFor(to);
        navigationState.set(href, state ?? null);
        nextRouter.push(href);
      },
      replace: (to: To, state?: unknown) => {
        const href = hrefFor(to);
        navigationState.set(href, state ?? null);
        nextRouter.replace(href);
      },
    }),
    [nextRouter],
  );
}

export function NextRouterAdapter({ children }: { children: React.ReactNode }) {
  const alreadyInRouter = useInRouterContext();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const navigator = useAdapterNavigator();
  // `window.location.hash` is never sent to the server: the server snapshot
  // ("") keeps SSR/hydration consistent, the client subscribes to changes.
  const hash = useSyncExternalStore(subscribeHashChange, getHashSnapshot, getHashServerSnapshot);

  const location = useMemo<Location>(() => {
    const search = searchParams.toString();
    return buildAdapterLocation({
      pathname: pathname ?? "/",
      search: search ? `?${search}` : "",
      hash,
    });
  }, [pathname, searchParams, hash]);

  if (alreadyInRouter) {
    return <>{children}</>;
  }

  return (
    <Router location={location} navigator={navigator}>
      {children}
    </Router>
  );
}

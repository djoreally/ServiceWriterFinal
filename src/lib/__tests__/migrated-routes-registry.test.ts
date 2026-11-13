/**
 * Migration registry ↔ App Router tree bijection (shell program, section S1).
 *
 * `src/lib/migratedRoutes.ts` is a hand-maintained registry that decides,
 * per URL, whether the App Router page or the legacy SPA shell serves the
 * path. The registry and the `app/` file tree are two separate statements of
 * the same fact, and they drift: `/website-bookings` shipped an
 * `app/(app)/website-bookings/page.tsx` without ever being registered, so
 * BOTH shells mounted on that URL (the SPA layer resolved to its NotFound
 * tree in the same #root). The registry file's own rule — "append the
 * prefix in the SAME change that adds the page.tsx, never one without the
 * other" — had no enforcement. This test is the enforcement.
 *
 * The bijection asserted here is at PREFIX level, matching the registry's
 * own semantics (a prefix claims its whole subtree):
 *
 *   1. Every page under `app/(app)/` is claimed by MIGRATED_ROUTE_PREFIXES.
 *   2. Every page under `app/(tenant)/` is claimed by
 *      MIGRATED_TENANT_ROUTE_PREFIXES or MIGRATED_ROUTE_PREFIXES (see the
 *      named overlap below).
 *   3. Every prefix in either registry claims at least one real page.
 *      Server redirect pages count as pages — a redirect is a served route.
 *
 * What this test deliberately does NOT assert: that a registered prefix's
 * BARE path renders (e.g. `/work-orders` has only a `[id]` page). That is
 * the dead-zone question, owned by section S2, not by registry truth.
 *
 * Every legitimate exception is named explicitly below. Nothing is skipped
 * silently: if a future change invalidates an exception, the corresponding
 * assertion fails and the exception list must be updated in the same change.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  MIGRATED_ROUTE_PREFIXES,
  MIGRATED_TENANT_ROUTE_PREFIXES,
} from '../migratedRoutes';

const repoRoot = path.resolve(__dirname, '../../..');
const appDir = path.join(repoRoot, 'app');

/**
 * Pages in the `(tenant)` tree whose prefixes live in the APP registry.
 * The `(tenant)` group hosts both the tenant-subdomain surfaces (claimed by
 * MIGRATED_TENANT_ROUTE_PREFIXES) and the public booking-door pages, whose
 * prefixes are registered in MIGRATED_ROUTE_PREFIXES because ClientOnlyShell
 * consults that list on app hosts. Pinned by route: a new page of this kind
 * must be added here consciously, in the same change.
 */
const TENANT_TREE_PAGES_CLAIMED_BY_APP_REGISTRY = [
  '/book/[slug]',
  '/public-services/[slug]',
  '/voice-agent/[slug]',
] as const;

/**
 * Registry prefixes whose only page lives OUTSIDE both route groups, as a
 * native App Router page. Key: prefix. Value: the page file (repo-relative)
 * that must exist and serve it.
 */
const NATIVE_PREFIX_PAGES: Record<string, string> = {
  '/features': 'app/features/[featureSlug]/page.tsx',
  '/features-guide': 'app/features-guide/page.tsx',
};

/**
 * Native public pages that are deliberately in NO registry: they exist
 * outside both route groups and `ClientOnlyShell` exempts them from the SPA
 * through its own NATIVE_PUBLIC_ROUTES set (src/ClientOnlyShell.tsx), which
 * is checked before the registry. If one of these is ever registered, this
 * exception is stale and must be removed in the same change.
 */
const NATIVE_PUBLIC_EXEMPTIONS = ['/tire', '/detailers'] as const;

/**
 * The root catch-all (`app/[[...path]]/page.tsx`) is not a page route: it is
 * the pass-through that hands unclaimed paths to the legacy shell. It is the
 * only file under `app/` whose computed route is `/`, and it is excluded
 * from the page universe by name.
 */
const ROOT_CATCH_ALL_FILE = 'app/[[...path]]/page.tsx';

function collectPageFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectPageFiles(full));
    else if (/^page\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * File path → URL route, following App Router rules:
 * - route groups `(…)` never appear in the URL;
 * - an optional catch-all `[[...x]]` segment serves its parent path, so the
 *   route is the parent directory's path (e.g. `fleet-os/[[...path]]`
 *   serves `/fleet-os`);
 * - dynamic segments (`[id]`, `[slug]`, …) stay literal — prefix claiming
 *   only ever inspects the literal segments above them.
 */
function routeForPageFile(file: string): string {
  const segments = path
    .relative(appDir, file)
    .split(path.sep)
    .slice(0, -1)
    .filter((s) => !/^\(.*\)$/.test(s));
  const routeSegments: string[] = [];
  for (const s of segments) {
    if (/^\[\[\.\.\..*\]\]$/.test(s)) break;
    routeSegments.push(s);
  }
  return '/' + routeSegments.join('/');
}

/** Segment-aware claim, mirroring `matchesPrefix` in migratedRoutes.ts. */
function claimsPrefix(prefix: string, route: string): boolean {
  return route === prefix || route.startsWith(prefix + '/');
}

function claimedByAny(route: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => claimsPrefix(p, route));
}

interface PageEntry {
  /** Repo-relative file path, posix separators. */
  file: string;
  route: string;
  /** Top-level route group under `app/`: '(app)', '(tenant)', or null. */
  group: string | null;
}

const allPages: PageEntry[] = collectPageFiles(appDir).map((file) => {
  const relToApp = path.relative(appDir, file).split(path.sep);
  const first = relToApp[0];
  return {
    file: path.relative(repoRoot, file).split(path.sep).join('/'),
    route: routeForPageFile(file),
    group: first === '(app)' || first === '(tenant)' ? first : null,
  };
});

const pageUniverse = allPages.filter((p) => p.file !== ROOT_CATCH_ALL_FILE);
const appPages = pageUniverse.filter((p) => p.group === '(app)');
const tenantPages = pageUniverse.filter((p) => p.group === '(tenant)');

describe('migration registry ↔ App Router tree bijection', () => {
  it('the tree walk finds the real tree (guards against a vacuous pass)', () => {
    expect(appPages.length).toBeGreaterThanOrEqual(40);
    expect(tenantPages.length).toBeGreaterThanOrEqual(10);
    expect(pageUniverse.length).toBeGreaterThanOrEqual(60);
  });

  it('excludes exactly the root catch-all, by name', () => {
    const excluded = allPages.filter((p) => p.file === ROOT_CATCH_ALL_FILE);
    expect(excluded.map((p) => p.route)).toEqual(['/']);
    expect(pageUniverse.some((p) => p.route === '/')).toBe(false);
  });

  it('every app/(app) page is claimed by MIGRATED_ROUTE_PREFIXES', () => {
    const unclaimed = appPages
      .filter((p) => !claimedByAny(p.route, MIGRATED_ROUTE_PREFIXES))
      .map((p) => `${p.route} (${p.file})`);
    expect(unclaimed).toEqual([]);
  });

  it('every app/(tenant) page is claimed by one of the two registries', () => {
    const unclaimed = tenantPages
      .filter(
        (p) =>
          !claimedByAny(p.route, MIGRATED_TENANT_ROUTE_PREFIXES) &&
          !claimedByAny(p.route, MIGRATED_ROUTE_PREFIXES),
      )
      .map((p) => `${p.route} (${p.file})`);
    expect(unclaimed).toEqual([]);
  });

  it('the (tenant) pages claimed by the app registry are exactly the named overlap', () => {
    const overlap = tenantPages
      .filter(
        (p) =>
          claimedByAny(p.route, MIGRATED_ROUTE_PREFIXES) &&
          !claimedByAny(p.route, MIGRATED_TENANT_ROUTE_PREFIXES),
      )
      .map((p) => p.route)
      .sort();
    expect(overlap).toEqual(
      [...TENANT_TREE_PAGES_CLAIMED_BY_APP_REGISTRY].sort(),
    );
  });

  it('every MIGRATED_ROUTE_PREFIXES prefix claims at least one page', () => {
    const orphans = MIGRATED_ROUTE_PREFIXES.filter(
      (prefix) => !pageUniverse.some((p) => claimsPrefix(prefix, p.route)),
    );
    expect(orphans).toEqual([]);
  });

  it('every MIGRATED_TENANT_ROUTE_PREFIXES prefix claims at least one page', () => {
    const orphans = MIGRATED_TENANT_ROUTE_PREFIXES.filter(
      (prefix) => !pageUniverse.some((p) => claimsPrefix(prefix, p.route)),
    );
    expect(orphans).toEqual([]);
  });

  it('native pages outside the groups serve exactly their named prefixes', () => {
    for (const [prefix, file] of Object.entries(NATIVE_PREFIX_PAGES)) {
      // The named file exists and its route is claimed by the prefix…
      const entry = pageUniverse.find((p) => p.file === file);
      expect(entry).toBeDefined();
      expect(claimsPrefix(prefix, entry!.route)).toBe(true);
      // …and no in-group page claims the prefix (else the exception is stale).
      const inGroup = [...appPages, ...tenantPages].filter((p) =>
        claimsPrefix(prefix, p.route),
      );
      expect(inGroup).toEqual([]);
    }
  });

  it('the /tire and /detailers exemptions stay unregistered by design', () => {
    for (const route of NATIVE_PUBLIC_EXEMPTIONS) {
      const entry = pageUniverse.find((p) => p.route === route);
      expect(entry).toBeDefined();
      expect(entry!.group).toBeNull();
      expect(claimedByAny(route, MIGRATED_ROUTE_PREFIXES)).toBe(false);
      expect(claimedByAny(route, MIGRATED_TENANT_ROUTE_PREFIXES)).toBe(false);
    }
  });
});

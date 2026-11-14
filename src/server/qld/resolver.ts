/**
 * QLD resolver — the translation layer between Service Writer's
 * stored vehicle strings and Quick Lube Data's exact-match contract.
 *
 * Why this exists (diagnosis, 2026-11-13): QLD's Developer API
 * requires year + make + model + engine, matched literally against
 * its own canonical spellings. SW stores "Transit T250" where QLD
 * knows only "Transit-250", holds human engine strings ("3.5L
 * 6-cyl") where QLD accepts only its tokens ("3.5", "Turbo 3.5"),
 * and often has no engine at all — which QLD answers with an
 * HTTP 400 both call sites used to discard. Every lookup failed
 * silently and the screens showed "Not recorded" forever.
 *
 * The resolver owns the translation, once:
 *   - Canonicalize make/model against QLD's OWN hierarchy lists
 *     (0-credit /makes and /models), never a hardcoded table.
 *   - Resolve the engine from the caller's hints (learned/stored,
 *     then NHTSA decode) converted to displacement tokens, matched
 *     against the hierarchy's engine list for the canonical YMM.
 *   - Expand a FAMILY model string (NHTSA's "NV" for the Nissan
 *     NV1500/2500/3500 vans) against the hierarchy when it matches
 *     no single model: a lone survivor is the model, and several
 *     survivors must agree on the oil data before any value is
 *     taken from the family — identity is never guessed.
 *   - Probe candidates in a deliberate order — a plain displacement
 *     token first, because QLD's oil data hangs on the plain-token
 *     row ("3.5") while the dressed token's row ("Turbo 3.5") can
 *     carry null oil fields — and PREFER the candidate whose spec
 *     row actually carries oil data. Filters are fetched for the
 *     same winning engine, so a resolution is one consistent row.
 *   - Credit-aware: hierarchy is free; spec probes are capped;
 *     filters are fetched once, for the winner only. An optional
 *     cache port lets the caller answer repeat resolutions from
 *     its own cache before any probe is spent.
 *
 * This module is deliberately free of Service Writer imports (it
 * speaks only to the QLD wire in ./client) so it can lift into the
 * shared vehicle-data-service unchanged; SW-specific concerns
 * (Supabase cache, NHTSA decode, merging) live in the adapter,
 * ./spec-provider.
 */
import {
  fetchQldJson,
  type QldClientDeps,
  type QldHttpResult,
} from "./client";

export interface QldYmm {
  year: number;
  make: string;
  model: string;
}

export interface QldCanonicalYmm extends QldYmm {
  engine: string;
}

export type QldResolution =
  | {
      status: "ok";
      canonical: QldCanonicalYmm;
      serviceSpec: Record<string, unknown>;
      filters: Record<string, unknown> | null;
      engines: string[];
      /** True when the bodies came from the caller's cache port. */
      fromCache: boolean;
    }
  | { status: "engine_required"; canonical: QldYmm; engines: string[] }
  | { status: "unavailable"; canonical: QldYmm };

/**
 * The caller's spec cache, as a narrow data port: given a fully
 * canonical YMME, answer the stored QLD bodies or null. The
 * resolver checks it per candidate (in probe order) before
 * spending a live probe.
 */
export interface QldSpecCachePort {
  read(
    input: QldCanonicalYmm,
  ): Promise<{
    serviceSpec: Record<string, unknown>;
    filters: Record<string, unknown> | null;
  } | null>;
}

export interface QldResolveInput extends QldYmm {
  /**
   * Engine strings the caller already holds, best first (learned/
   * stored engine, then an NHTSA decode). Any format — human
   * strings are converted to displacement tokens here.
   */
  engineHints?: Array<string | null | undefined>;
}

export interface QldResolveDeps extends QldClientDeps {
  cachePort?: QldSpecCachePort | null;
  /** Cap on live service-spec probes per resolution (default 3). */
  maxSpecProbes?: number;
}

const DEFAULT_MAX_SPEC_PROBES = 3;
const MAX_CACHE_READS = 6;

// ---------------------------------------------------------------------------
// String translation primitives (exported for reuse + tests)
// ---------------------------------------------------------------------------

function clean(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Lowercase, trimmed, single-spaced — the loose comparison form. */
export function looseNorm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Lowercase alphanumerics only — "Transit-250" → "transit250". */
export function squash(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** QLD canonicalizes makes by dropping a trailing "Trucks"/"Truck". */
export function stripTruckSuffix(make: string): string {
  return make.replace(/\s+trucks?$/i, "").trim();
}

/** The loose key a make is filed under (CSV/catalog lookups share it). */
export function qldLooseMakeKey(make: string): string {
  return squash(stripTruckSuffix(make));
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const curr = [i];
    for (let j = 1; j <= b.length; j += 1) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = curr;
  }
  return prev[b.length];
}

/**
 * Match a free-form stored string to the one canonical candidate
 * it names, or null when no candidate is close enough to trust.
 * Order: exact loose match, exact squashed match, truck-stripped
 * variants, then a unique best edit distance on the squashed
 * forms ("transitt250" → "transit250" is one deletion). Ambiguity
 * or distance beyond a quarter of the string answers null — the
 * caller falls back to its raw string rather than a guess.
 */
export function matchQldCandidate(
  raw: string,
  candidates: string[],
): string | null {
  const rawLoose = looseNorm(raw);
  const rawSquash = squash(raw);
  if (!rawSquash) return null;
  const variants = new Set([rawLoose, squash(raw)]);
  const stripped = stripTruckSuffix(raw);
  if (stripped !== raw) {
    variants.add(looseNorm(stripped));
    variants.add(squash(stripped));
  }
  for (const candidate of candidates) {
    if (variants.has(looseNorm(candidate)) || variants.has(squash(candidate))) {
      return candidate;
    }
  }
  let best: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  let secondDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const distance = editDistance(rawSquash, squash(candidate));
    if (distance < bestDistance) {
      secondDistance = bestDistance;
      bestDistance = distance;
      best = candidate;
    } else if (distance < secondDistance) {
      secondDistance = distance;
    }
  }
  if (best === null) return null;
  const threshold = Math.max(1, Math.floor(rawSquash.length / 4));
  return bestDistance <= threshold && bestDistance < secondDistance
    ? best
    : null;
}

/**
 * The displacement token inside an engine string, in QLD's
 * canonical numeric form ("3.5L 6-cyl" → "3.5", "4.0L 6-cyl" →
 * "4", "Turbo 3.5" → "3.5", "Diesel 2" → "2"). Null when the
 * string carries no number at all.
 */
export function displacementToken(engine: string): string | null {
  const match = /(\d+(?:\.\d+)?)/.exec(engine);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? String(value) : null;
}

/** A bare displacement token and nothing else ("3.5", "4"). */
export function isPlainDisplacementToken(engine: string): boolean {
  const trimmed = engine.trim();
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) return false;
  const token = displacementToken(trimmed);
  return token !== null && Number(token) === Number(trimmed);
}

/**
 * Probe order for a YMM's canonical engine list, given the
 * caller's hints. Plain displacement tokens derived from the
 * hints lead (QLD's oil rows hang on them); the hints' exact
 * spellings follow; remaining token-sharing candidates, the
 * list's other plain tokens, and finally the rest in QLD's own
 * order. Deterministic and duplicate-free.
 */
export function orderEngineCandidates(
  engines: string[],
  hints: Array<string | null | undefined>,
): string[] {
  const hintStrings = hints
    .map((hint) => clean(hint))
    .filter((hint): hint is string => Boolean(hint));
  const hintTokens = hintStrings
    .map((hint) => displacementToken(hint))
    .filter((token): token is string => Boolean(token));
  const tokenOf = (engine: string) => displacementToken(engine);

  const buckets: string[][] = [
    engines.filter(
      (engine) =>
        isPlainDisplacementToken(engine) &&
        hintTokens.includes(tokenOf(engine) ?? ""),
    ),
    engines.filter((engine) =>
      hintStrings.some((hint) => looseNorm(hint) === looseNorm(engine)),
    ),
    engines.filter((engine) => hintTokens.includes(tokenOf(engine) ?? "")),
    engines.filter((engine) => isPlainDisplacementToken(engine)),
    [...engines],
  ];
  const ordered: string[] = [];
  for (const bucket of buckets) {
    for (const engine of bucket) {
      if (!ordered.includes(engine)) ordered.push(engine);
    }
  }
  return ordered;
}

// ---------------------------------------------------------------------------
// Wire helpers
// ---------------------------------------------------------------------------

function ymmQuery(input: QldYmm & { engine?: string | null }): string {
  const params = new URLSearchParams({
    year: String(input.year),
    make: input.make,
    model: input.model,
  });
  const engine = clean(input.engine);
  if (engine) params.set("engine", engine);
  return params.toString();
}

function stringList(body: Record<string, unknown>, key: string): string[] {
  const raw = body[key] ?? record(body.spec)[key];
  if (!Array.isArray(raw)) return [];
  return raw
    .map(
      (entry) =>
        clean(entry) ??
        clean(record(entry).engine) ??
        clean(record(entry).name) ??
        clean(record(entry).value),
    )
    .filter((entry): entry is string => Boolean(entry));
}

async function fetchHierarchyList(
  path: string,
  key: string,
  deps: QldClientDeps,
): Promise<string[] | null> {
  const result = await fetchQldJson(path, deps);
  if (!result || result.status < 200 || result.status >= 300) return null;
  return stringList(result.body, key);
}

function isSpecSuccess(result: QldHttpResult | null): boolean {
  return Boolean(
    result &&
      result.status >= 200 &&
      result.status < 300 &&
      result.body.success === true &&
      record(result.body.spec).vehicle,
  );
}

function isEngineRequired(result: QldHttpResult | null): boolean {
  if (!result) return false;
  if (result.body.status === "engine_required") return true;
  if (result.status === 400) {
    const message = String(result.body.message ?? "");
    return /engine/i.test(message) && /required/i.test(message);
  }
  return false;
}

function enginesFromBody(body: Record<string, unknown>): string[] {
  return stringList(body, "engines");
}

function finitePositive(value: unknown): boolean {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0;
}

/** Does this service-spec body carry oil data (the probe preference)? */
export function specCarriesOil(serviceSpecBody: Record<string, unknown>): boolean {
  const oil = record(record(serviceSpecBody.spec).oil);
  if (clean(oil.viscosity)) return true;
  const capacity = record(oil.capacity);
  return (
    finitePositive(capacity.quarts) ||
    finitePositive(capacity.liters) ||
    Boolean(clean(capacity.display))
  );
}

// ---------------------------------------------------------------------------
// Family models
// ---------------------------------------------------------------------------

const MAX_FAMILY_MEMBERS = 6;

/** The oil identity two spec bodies must share to be "the same spec". */
function oilAgreementKey(serviceSpecBody: Record<string, unknown>): string {
  const oil = record(record(serviceSpecBody.spec).oil);
  const capacity = record(oil.capacity);
  const torque = record(oil.drainPlugTorque);
  return JSON.stringify({
    viscosity: clean(oil.viscosity) ?? null,
    quarts: finitePositive(capacity.quarts) ?? null,
    liters: finitePositive(capacity.liters) ?? null,
    capacityDisplay: clean(capacity.display) ?? null,
    ftLbs: finitePositive(torque.ftLbs) ?? null,
    nm: finitePositive(torque.nm) ?? null,
  });
}

function filtersAgreementKey(filtersBody: Record<string, unknown> | null): string {
  if (!filtersBody) return "null";
  return JSON.stringify(record(record(filtersBody.spec).filters));
}

/**
 * Probe one model's engines for a spec row, cache port first, then
 * live in hint order, preferring the oil-carrying row — the main
 * resolution's probe discipline, for one family member.
 */
async function probeModelEngines(
  ymm: QldYmm,
  engines: string[],
  hints: string[],
  deps: QldResolveDeps,
): Promise<{ engine: string; body: Record<string, unknown>; fromCache: boolean } | null> {
  const candidates = orderEngineCandidates(engines, hints);
  if (deps.cachePort) {
    let reads = 0;
    for (const engine of candidates) {
      if (reads >= MAX_CACHE_READS) break;
      reads += 1;
      const hit = await deps.cachePort
        .read({ ...ymm, engine })
        .catch(() => null);
      if (hit) return { engine, body: hit.serviceSpec, fromCache: true };
    }
  }
  const maxProbes = Math.max(1, deps.maxSpecProbes ?? DEFAULT_MAX_SPEC_PROBES);
  let fallback: { engine: string; body: Record<string, unknown>; fromCache: boolean } | null = null;
  let probed = 0;
  for (const engine of candidates) {
    if (probed >= maxProbes) break;
    probed += 1;
    const result = await fetchQldJson(
      `/api/v1/developer/vehicles/service-spec?${ymmQuery({ ...ymm, engine })}`,
      deps,
    );
    if (!isSpecSuccess(result)) continue;
    if (specCarriesOil(result!.body)) {
      return { engine, body: result!.body, fromCache: false };
    }
    if (!fallback) fallback = { engine, body: result!.body, fromCache: false };
  }
  return fallback;
}

type ModelFamilyOutcome =
  | { kind: "model"; model: string; engines: string[] }
  | { kind: "resolution"; resolution: QldResolution };

/**
 * Expand a stored model string that names a FAMILY of QLD models —
 * its squashed form is a strict prefix of several hierarchy entries
 * (NHTSA's "NV" for Nissan's NV1500/NV200/NV2500/NV3500) — using
 * only the family's own evidence:
 *
 *   - a lone prefix extension, or a lone survivor once the
 *     caller's engine hints filter the family's engine lists, IS
 *     the model (the caller continues down the normal path);
 *   - several survivors are probed, and their values are taken
 *     only when every probed survivor AGREES on the oil data (and
 *     on the filters, when filters answer at all) — the values
 *     are then verified family-wide facts, not a guessed identity;
 *   - disagreement answers `unavailable`: a guess would be worse
 *     than an honest blank.
 *
 * The canonical model on a family-verified answer stays the stored
 * family string — the resolver resolves specs, not identities.
 */
async function resolveModelFamily(
  args: {
    year: number;
    make: string;
    rawModel: string;
    models: string[];
    hints: string[];
  },
  deps: QldResolveDeps,
): Promise<ModelFamilyOutcome | null> {
  const rawSquash = squash(args.rawModel);
  if (rawSquash.length < 2) return null;
  const family = args.models.filter((candidate) => {
    const candidateSquash = squash(candidate);
    return (
      candidateSquash.length > rawSquash.length &&
      candidateSquash.startsWith(rawSquash)
    );
  });
  if (!family.length) return null;

  const enginesFor = (forModel: string) =>
    fetchHierarchyList(
      `/api/v1/developer/engines?${ymmQuery({ year: args.year, make: args.make, model: forModel })}`,
      "engines",
      deps,
    );

  if (family.length === 1) {
    return {
      kind: "model",
      model: family[0],
      engines: (await enginesFor(family[0])) ?? [],
    };
  }

  const members: { model: string; engines: string[] }[] = [];
  for (const member of family.slice(0, MAX_FAMILY_MEMBERS)) {
    const engines = await enginesFor(member);
    if (engines && engines.length) members.push({ model: member, engines });
  }
  if (!members.length) return null;

  const hintTokens = args.hints
    .map((hint) => displacementToken(hint))
    .filter((token): token is string => Boolean(token));
  let survivors = members;
  if (hintTokens.length) {
    const preferred = members.filter((member) =>
      member.engines.some(
        (engine) => hintTokens.includes(displacementToken(engine) ?? ""),
      ),
    );
    if (preferred.length) survivors = preferred;
  }
  if (survivors.length === 1) {
    return {
      kind: "model",
      model: survivors[0].model,
      engines: survivors[0].engines,
    };
  }

  const probed: {
    model: string;
    engine: string;
    body: Record<string, unknown>;
    fromCache: boolean;
  }[] = [];
  for (const survivor of survivors) {
    const hit = await probeModelEngines(
      { year: args.year, make: args.make, model: survivor.model },
      survivor.engines,
      args.hints,
      deps,
    );
    if (hit) probed.push({ model: survivor.model, ...hit });
  }
  if (!probed.length) return null;

  const first = probed[0];
  const agreed = probed.every(
    (entry) => oilAgreementKey(entry.body) === oilAgreementKey(first.body),
  );
  if (!agreed) {
    return {
      kind: "resolution",
      resolution: {
        status: "unavailable",
        canonical: { year: args.year, make: args.make, model: args.rawModel },
      },
    };
  }

  // Filters ride along only when the family agrees on them too;
  // any refusal or disagreement leaves them an honest blank.
  let filters: Record<string, unknown> | null = null;
  const filterBodies: (Record<string, unknown> | null)[] = [];
  for (const entry of probed) {
    const result = await fetchQldJson(
      `/api/v1/developer/filters?${ymmQuery({ year: args.year, make: args.make, model: entry.model, engine: entry.engine })}`,
      deps,
    );
    filterBodies.push(isSpecSuccess(result) ? result!.body : null);
  }
  const firstFilters = filterBodies[0] ?? null;
  if (
    firstFilters &&
    filterBodies.every((body) => body !== null) &&
    filterBodies.every(
      (body) => filtersAgreementKey(body) === filtersAgreementKey(firstFilters),
    )
  ) {
    filters = firstFilters;
  }

  return {
    kind: "resolution",
    resolution: {
      status: "ok",
      canonical: {
        year: args.year,
        make: args.make,
        model: args.rawModel,
        engine: first.engine,
      },
      serviceSpec: first.body,
      filters,
      engines: survivors.find((s) => s.model === first.model)?.engines ?? [],
      fromCache: probed.every((entry) => entry.fromCache),
    },
  };
}

// ---------------------------------------------------------------------------
// The resolution
// ---------------------------------------------------------------------------

/**
 * Resolve one vehicle's YMME against QLD: canonicalize, order the
 * engine candidates, probe (cache port first, then live), prefer
 * the oil-carrying row, and fetch filters for the winning engine.
 * Never throws; every failure is a status, not an exception.
 */
export async function resolveQldVehicle(
  input: QldResolveInput,
  deps: QldResolveDeps = {},
): Promise<QldResolution> {
  const raw: QldYmm = {
    year: Number(input.year),
    make: clean(input.make) ?? "",
    model: clean(input.model) ?? "",
  };
  if (!Number.isFinite(raw.year) || raw.year <= 0 || !raw.make || !raw.model) {
    return { status: "unavailable", canonical: raw };
  }
  const hints = (input.engineHints ?? []).filter(
    (hint): hint is string => Boolean(clean(hint)),
  );

  // -- Canonicalize make/model against QLD's own hierarchy (free). --
  const makes = await fetchHierarchyList(
    `/api/v1/developer/makes?${new URLSearchParams({ year: String(raw.year) }).toString()}`,
    "makes",
    deps,
  );
  let make = raw.make;
  if (makes) {
    make = matchQldCandidate(raw.make, makes) ?? stripTruckSuffix(raw.make);
  }
  const fetchModels = (forMake: string) =>
    fetchHierarchyList(
      `/api/v1/developer/models?${new URLSearchParams({ year: String(raw.year), make: forMake }).toString()}`,
      "models",
      deps,
    );
  let models = await fetchModels(make);
  if (!models && make !== raw.make) models = await fetchModels(raw.make);
  let model = raw.model;
  let modelMatched = false;
  if (models) {
    const matched = matchQldCandidate(raw.model, models);
    if (matched) {
      model = matched;
      modelMatched = true;
    }
  }

  // -- The canonical engine list for the YMM (free). --
  const fetchEngines = (forModel: string) =>
    fetchHierarchyList(
      `/api/v1/developer/engines?${ymmQuery({ year: raw.year, make, model: forModel })}`,
      "engines",
      deps,
    );
  let engines = await fetchEngines(model);
  if ((!engines || engines.length === 0) && model !== raw.model) {
    engines = (await fetchEngines(raw.model)) ?? engines;
  }
  let engineList = engines ?? [];

  // -- Family models: a stored string that matched no candidate
  //    and names no engines of its own may name a FAMILY of QLD
  //    models instead (NHTSA decodes every Nissan NV van as model
  //    "NV"; QLD lists NV1500/NV200/NV2500/NV3500). Expand it
  //    against the hierarchy and let the family's own evidence
  //    settle what it can — see resolveModelFamily. --
  if (!engineList.length && !modelMatched && models && models.length) {
    const family = await resolveModelFamily(
      { year: raw.year, make, rawModel: raw.model, models, hints },
      deps,
    );
    if (family?.kind === "resolution") return family.resolution;
    if (family?.kind === "model") {
      model = family.model;
      engineList = family.engines;
    }
  }

  const canonical: QldYmm = { year: raw.year, make, model };

  // -- Candidate order. With no hierarchy list, fall back to the
  //    caller's own hint (then its bare token): a stored string is
  //    still worth one direct attempt before giving up. --
  let candidates: string[];
  if (engineList.length) {
    candidates = orderEngineCandidates(engineList, hints);
  } else if (hints.length) {
    candidates = [];
    for (const candidate of [hints[0], displacementToken(hints[0]) ?? ""]) {
      if (candidate && !candidates.includes(candidate)) candidates.push(candidate);
    }
  } else {
    candidates = [];
  }

  // -- Cache port: a prior resolution answers repeat lookups for
  //    free, candidate by candidate, before any probe is spent. --
  if (deps.cachePort) {
    let reads = 0;
    for (const engine of candidates) {
      if (reads >= MAX_CACHE_READS) break;
      reads += 1;
      const hit = await deps.cachePort
        .read({ ...canonical, engine })
        .catch(() => null);
      if (hit) {
        return {
          status: "ok",
          canonical: { ...canonical, engine },
          serviceSpec: hit.serviceSpec,
          filters: hit.filters,
          engines: engineList,
          fromCache: true,
        };
      }
    }
  }

  // -- No candidates at all: one direct attempt without an engine.
  //    QLD's answer either succeeds (single-engine YMMs do exist)
  //    or names the situation (engine_required / unavailable). --
  if (!candidates.length) {
    const query = ymmQuery(canonical);
    const [specResult, filtersResult] = await Promise.all([
      fetchQldJson(`/api/v1/developer/vehicles/service-spec?${query}`, deps),
      fetchQldJson(`/api/v1/developer/filters?${query}`, deps),
    ]);
    if (isEngineRequired(specResult) || isEngineRequired(filtersResult)) {
      const listed = enginesFromBody(specResult?.body ?? {});
      return {
        status: "engine_required",
        canonical,
        engines: listed.length
          ? listed
          : enginesFromBody(filtersResult?.body ?? {}),
      };
    }
    if (isSpecSuccess(specResult) || isSpecSuccess(filtersResult)) {
      const specBody = isSpecSuccess(specResult) ? specResult!.body : null;
      const engine =
        clean(record(record(specBody?.spec).vehicle).engine) ??
        clean(record(record(filtersResult?.body.spec).vehicle).engine) ??
        hints[0] ??
        "";
      return {
        status: "ok",
        canonical: { ...canonical, engine },
        serviceSpec: specBody ?? {},
        filters: isSpecSuccess(filtersResult) ? filtersResult!.body : null,
        engines: engineList,
        fromCache: false,
      };
    }
    return { status: "unavailable", canonical };
  }

  // -- Probe candidates in order; prefer the oil-carrying row. --
  const maxProbes = Math.max(1, deps.maxSpecProbes ?? DEFAULT_MAX_SPEC_PROBES);
  let fallback: { engine: string; body: Record<string, unknown> } | null = null;
  let winner: { engine: string; body: Record<string, unknown> } | null = null;
  let sawEngineRequired = false;
  let probed = 0;
  for (const engine of candidates) {
    if (probed >= maxProbes) break;
    probed += 1;
    const result = await fetchQldJson(
      `/api/v1/developer/vehicles/service-spec?${ymmQuery({ ...canonical, engine })}`,
      deps,
    );
    if (isEngineRequired(result)) {
      sawEngineRequired = true;
      continue;
    }
    if (!isSpecSuccess(result)) continue;
    if (specCarriesOil(result!.body)) {
      winner = { engine, body: result!.body };
      break;
    }
    if (!fallback) fallback = { engine, body: result!.body };
  }
  const chosen = winner ?? fallback;
  if (!chosen) {
    return sawEngineRequired
      ? { status: "engine_required", canonical, engines: engineList }
      : { status: "unavailable", canonical };
  }

  // -- Filters for the SAME winning engine (one call). --
  const filtersResult = await fetchQldJson(
    `/api/v1/developer/filters?${ymmQuery({ ...canonical, engine: chosen.engine })}`,
    deps,
  );
  return {
    status: "ok",
    canonical: { ...canonical, engine: chosen.engine },
    serviceSpec: chosen.body,
    filters: isSpecSuccess(filtersResult) ? filtersResult!.body : null,
    engines: engineList,
    fromCache: false,
  };
}

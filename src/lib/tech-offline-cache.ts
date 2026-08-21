import type { TechMissionBoard, TechMissionJob } from "@/lib/tech-mission-board";

const CACHE_VERSION = 1;
const CACHE_PREFIX = "tech-app:mission-board";
const CONTEXT_PREFIX = "tech-app:context";
const WORKSPACE_PREFIX = "tech-app:workspace";
const THREAD_PREFIX = "tech-app:thread";

export interface TechMissionBoardCachePayload {
  version: number;
  cachedAt: string;
  userId: string;
  missionBoard: TechMissionBoard;
  jobs: TechMissionJob[];
}

interface GenericCachePayload<T> {
  version: number;
  cachedAt: string;
  key: string;
  data: T;
}

function cacheKey(userId: string): string {
  return `${CACHE_PREFIX}:${userId}`;
}

export function saveTechMissionBoardCache(userId: string, missionBoard: TechMissionBoard, jobs: TechMissionJob[], storage: Pick<Storage, "setItem"> = localStorage): void {
  storage.setItem(cacheKey(userId), JSON.stringify({
    version: CACHE_VERSION,
    cachedAt: new Date().toISOString(),
    userId,
    missionBoard,
    jobs,
  } satisfies TechMissionBoardCachePayload));
}

export function readTechMissionBoardCache(userId: string, storage: Pick<Storage, "getItem"> = localStorage): TechMissionBoardCachePayload | null {
  const raw = storage.getItem(cacheKey(userId));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as TechMissionBoardCachePayload;
    if (parsed.version !== CACHE_VERSION || parsed.userId !== userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Phase 4 — offline field recovery for the rest of the technician surface:
 * technician context, the open job workspace, and its message thread.
 */
function writeCache<T>(key: string, data: T, storage: Pick<Storage, "setItem"> = localStorage): void {
  try {
    storage.setItem(key, JSON.stringify({ version: CACHE_VERSION, cachedAt: new Date().toISOString(), key, data } satisfies GenericCachePayload<T>));
  } catch {
    // storage full / disabled — cache is best effort only
  }
}

function readCache<T>(key: string, storage: Pick<Storage, "getItem"> = localStorage): { cachedAt: string; data: T } | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GenericCachePayload<T>;
    if (parsed.version !== CACHE_VERSION || parsed.key !== key) return null;
    return { cachedAt: parsed.cachedAt, data: parsed.data };
  } catch {
    return null;
  }
}

export function saveTechContextCache<T>(userId: string, context: T, storage?: Pick<Storage, "setItem">): void {
  writeCache(`${CONTEXT_PREFIX}:${userId}`, context, storage);
}

export function readTechContextCache<T>(userId: string, storage?: Pick<Storage, "getItem">) {
  return readCache<T>(`${CONTEXT_PREFIX}:${userId}`, storage);
}

export function saveTechWorkspaceCache<T>(jobId: string, workspace: T, storage?: Pick<Storage, "setItem">): void {
  writeCache(`${WORKSPACE_PREFIX}:${jobId}`, workspace, storage);
}

export function readTechWorkspaceCache<T>(jobId: string, storage?: Pick<Storage, "getItem">) {
  return readCache<T>(`${WORKSPACE_PREFIX}:${jobId}`, storage);
}

export function saveTechThreadCache<T>(threadId: string, timeline: T, storage?: Pick<Storage, "setItem">): void {
  writeCache(`${THREAD_PREFIX}:${threadId}`, timeline, storage);
}

export function readTechThreadCache<T>(threadId: string, storage?: Pick<Storage, "getItem">) {
  return readCache<T>(`${THREAD_PREFIX}:${threadId}`, storage);
}

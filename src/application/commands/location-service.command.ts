import { supabase } from "@/integrations/supabase/client";
import type {
  GuidanceMode,
  GuidanceRoute,
  JobSource,
  LocationBatchResult,
  LocationEventInput,
  LocationPersistenceMode,
  LocationQualityInput,
  NavigationEventPayload,
  NavigationEventType,
  NavigationSession,
  ResolvedLocation,
} from "@/application/location/location-service.contracts";

class LocationServiceCommandError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "LocationServiceCommandError";
  }
}

async function invokeLocationService<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("location-service", { body });
  if (error) {
    throw new LocationServiceCommandError(error.message || "Location service request failed", "location_service_unavailable");
  }

  const payload = data as { error?: string } | T | null;
  if (!payload) {
    throw new LocationServiceCommandError("Location service returned no result", "location_service_empty_response");
  }
  if (typeof payload === "object" && "error" in payload && typeof payload.error === "string") {
    throw new LocationServiceCommandError(payload.error, payload.error);
  }
  return payload as T;
}

export async function ingestLocationBatch(events: LocationEventInput[]): Promise<LocationBatchResult> {
  return invokeLocationService<LocationBatchResult>({
    action: "ingest_location_batch",
    events,
  });
}

export async function getRoutePreview(input: {
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  profile?: "driving" | "driving-traffic";
  alternatives?: boolean;
}): Promise<{ routes: GuidanceRoute[] }> {
  return invokeLocationService({
    action: "get_route_preview",
    origin: input.origin,
    destination: input.destination,
    profile: input.profile ?? "driving-traffic",
    alternatives: input.alternatives ?? false,
  });
}

export async function resolveLocation(input: {
  query: string;
  country?: string;
  limit?: number;
  proximity?: { latitude: number; longitude: number };
  persistenceMode?: LocationPersistenceMode;
}): Promise<{ results: ResolvedLocation[]; persistenceMode: LocationPersistenceMode }> {
  return invokeLocationService({
    action: "resolve_location",
    query: input.query,
    country: input.country,
    limit: input.limit,
    proximity: input.proximity,
    persistenceMode: input.persistenceMode ?? "temporary",
  });
}

export interface DispatchCandidate {
  resourceId: string;
  technicianId: string;
  technicianName: string;
  availabilityStatus: string;
  capabilities: string[];
  etaSeconds: number | null;
  distanceMeters: number | null;
  freshnessStatus: string;
  capturedAt: string | null;
  scoreSeconds: number;
  explanation: {
    roadEtaSeconds: number | null;
    freshnessPenaltySeconds: number;
    availabilityPenaltySeconds: number;
  };
}

export interface DispatchLocationQuality {
  status: "verified" | "overridden" | "needs_confirmation" | "approximate" | "missing";
  requiresReview: boolean;
  advisory: string | null;
}

export async function getDispatchCandidates(input: {
  jobId: string;
  jobSource: JobSource;
  limit?: number;
}): Promise<{ candidates: DispatchCandidate[]; locationQuality: DispatchLocationQuality }> {
  return invokeLocationService({
    action: "get_dispatch_candidates",
    jobId: input.jobId,
    jobSource: input.jobSource,
    limit: input.limit ?? 10,
  });
}

export interface LocationQualityQueueItem {
  jobId: string;
  jobSource: JobSource;
  title: string;
  scheduledDate: string | null;
  scheduledTime: string | null;
  locationAddress: string | null;
  assignedTechnicianName: string | null;
  qualityStatus: "verified" | "needs_confirmation" | "approximate" | "missing" | "overridden";
  normalizedAddress: string | null;
  mapboxFeatureId: string | null;
  latitude: number | null;
  longitude: number | null;
  persistenceMode: LocationPersistenceMode;
  overrideReason: string | null;
  updatedAt: string | null;
}

export async function getLocationQualityQueue(daysAhead = 7): Promise<{ jobs: LocationQualityQueueItem[] }> {
  return invokeLocationService({ action: "get_location_quality_queue", daysAhead });
}

export async function saveLocationQuality(input: LocationQualityInput): Promise<{ locationQuality: unknown }> {
  return invokeLocationService({ action: "save_location_quality", ...input });
}

export async function createNavigationSession(input: {
  jobId: string;
  jobSource: JobSource;
  selectedRouteId?: string;
  plannedDistanceMeters?: number;
  plannedDurationSeconds?: number;
  guidanceMode?: GuidanceMode;
}): Promise<{ navigationSession: NavigationSession; reused: boolean }> {
  return invokeLocationService({
    action: "create_navigation_session",
    ...input,
    guidanceMode: input.guidanceMode ?? "web",
  });
}

export async function recordNavigationEvent(input: {
  navigationSessionId: string;
  eventType: NavigationEventType;
  idempotencyKey?: string;
  occurredAt?: string;
  payload?: NavigationEventPayload;
}): Promise<{ navigationEvent: unknown; navigationSessionId: string }> {
  return invokeLocationService({
    action: "record_navigation_event",
    navigationSessionId: input.navigationSessionId,
    eventType: input.eventType,
    idempotencyKey: input.idempotencyKey,
    occurredAt: input.occurredAt,
    payload: input.payload ?? {},
  });
}

export { LocationServiceCommandError };

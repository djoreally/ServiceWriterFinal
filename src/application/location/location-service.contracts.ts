export type LocationSource = "native" | "web" | "telematics" | "manual" | "legacy";
export type JobSource = "appointment" | "fleet_work_order";
export type LocationQualityStatus = "verified" | "needs_confirmation" | "approximate" | "missing" | "overridden";
export type LocationPersistenceMode = "temporary" | "permanent";
export type GuidanceMode = "web" | "native";

export type NavigationSessionStatus =
  | "created"
  | "acknowledged"
  | "active"
  | "arrived_pending"
  | "arrived"
  | "ended"
  | "cancelled"
  | "superseded";
export type NavigationEventType =
  | "route_selected"
  | "acknowledged"
  | "navigation_started"
  | "progress"
  | "rerouted"
  | "arrival_suggested"
  | "arrival_confirmed"
  | "work_started"
  | "work_paused"
  | "work_resumed"
  | "work_completed"
  | "navigation_ended"
  | "exception";

export interface LocationEventInput {
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
  altitudeMeters?: number | null;
  headingDegrees?: number | null;
  speedMps?: number | null;
  source: LocationSource;
  clientSequence?: number;
  idempotencyKey?: string;
  capturedAt?: string;
  navigationSessionId?: string;
  qualityFlags?: string[];
}

export interface LocationBatchResult {
  technicianId: string;
  resourceId: string;
  accepted: number;
  duplicates: number;
  rejected: Array<{ idempotencyKey?: string; reason: string }>;
}

export interface ResolvedLocation {
  featureId: string | null;
  label: string;
  latitude: number;
  longitude: number;
  addressType: string | null;
  routable: boolean;
  persistenceMode: LocationPersistenceMode;
}

export interface LocationQualityInput {
  jobId: string;
  jobSource: JobSource;
  enteredAddress?: string | null;
  normalizedAddress?: string | null;
  mapboxFeatureId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  entranceLatitude?: number | null;
  entranceLongitude?: number | null;
  addressType?: string | null;
  qualityStatus: LocationQualityStatus;
  persistenceMode: LocationPersistenceMode;
  overrideReason?: string | null;
}

export interface NavigationSession {
  id: string;
  user_id: string;
  job_id: string;
  job_source: JobSource;
  technician_id: string;
  resource_id: string;
  destination_label: string;
  destination_latitude: number;
  destination_longitude: number;
  selected_route_id: string | null;
  planned_distance_meters: number | null;
  planned_duration_seconds: number | null;
  last_eta_at: string | null;
  last_eta_seconds: number | null;
  status: NavigationSessionStatus;
  started_at: string | null;
  ended_at: string | null;
  reroute_count: number;
  last_event_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NavigationEventPayload {
  selectedRouteId?: string;
  plannedDistanceMeters?: number;
  plannedDurationSeconds?: number;
  etaAt?: string;
  etaSeconds?: number;
  note?: string;
  reason?: string;
}

/** Normalized turn-by-turn maneuver emitted by the location-service route preview. */
export interface GuidanceStep {
  stepIndex: number;
  legIndex: number;
  instruction: string;
  bannerPrimary: string | null;
  bannerSecondary: string | null;
  voiceInstruction: string | null;
  voiceTriggerMeters: number | null;
  maneuverType: string | null;
  maneuverModifier: string | null;
  distanceMeters: number;
  durationSeconds: number;
  location: [number, number] | null;
  name: string | null;
}

export interface GuidanceRoute {
  routeId: string;
  distanceMeters: number;
  durationSeconds: number;
  geometry: GeoJSON.LineString;
  legs: Array<{ distance?: number; duration?: number; steps?: unknown[] }>;
  steps: GuidanceStep[];
}

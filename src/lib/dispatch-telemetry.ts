type TelemetrySource = "dispatch_board" | "command_center";

interface WorkspaceMetricInput {
  workspaceOwnerUserId?: string | null;
  /** @deprecated Use workspaceOwnerUserId for new call sites. */
  tenantId?: string | null;
  dayKey?: string;
}

interface UnknownComboMetricInput extends WorkspaceMetricInput {
  status: string;
  dispatchStatus: string;
  source: TelemetrySource;
}

const METRIC_STORAGE_KEY = "dispatch_visibility_metrics_v1";
const LEGACY_TENANT_ID_METRIC_FIELD = "tenant_id" as const;

interface StoredMetrics {
  unknownCombos: Record<string, number>;
  snapshots: Record<string, number>;
}

function getDayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function getWorkspaceOwnerUserId(input: WorkspaceMetricInput): string {
  return input.workspaceOwnerUserId || input.tenantId || "unknown_workspace";
}

function readMetrics(): StoredMetrics {
  if (typeof window === "undefined") return { unknownCombos: {}, snapshots: {} };
  try {
    const raw = window.localStorage.getItem(METRIC_STORAGE_KEY);
    if (!raw) return { unknownCombos: {}, snapshots: {} };
    return JSON.parse(raw) as StoredMetrics;
  } catch {
    return { unknownCombos: {}, snapshots: {} };
  }
}

function writeMetrics(metrics: StoredMetrics) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(METRIC_STORAGE_KEY, JSON.stringify(metrics));
  } catch {
    // best effort; telemetry should not break UX
  }
}

function emitMetric(name: string, payload: Record<string, unknown>) {
  console.info(`[DispatchMetric] ${name}`, payload);
}

export function trackUnknownStateComboPerTenantDay(input: UnknownComboMetricInput) {
  const workspaceOwnerUserId = getWorkspaceOwnerUserId(input);
  const dayKey = input.dayKey || getDayKey();
  const comboKey = `${workspaceOwnerUserId}:${dayKey}:${input.status}:${input.dispatchStatus}:${input.source}`;
  const metrics = readMetrics();
  metrics.unknownCombos[comboKey] = (metrics.unknownCombos[comboKey] || 0) + 1;
  writeMetrics(metrics);

  emitMetric("unknown_state_combo_per_tenant_day", {
    [LEGACY_TENANT_ID_METRIC_FIELD]: workspaceOwnerUserId,
    day: dayKey,
    source: input.source,
    status: input.status,
    dispatch_status: input.dispatchStatus,
    count: metrics.unknownCombos[comboKey],
  });
}

export function emitCommandCenterStateDegradedCount(input: WorkspaceMetricInput & {
  degradedCount: number;
}) {
  emitMetric("command_center_state_degraded_count", {
    [LEGACY_TENANT_ID_METRIC_FIELD]: getWorkspaceOwnerUserId(input),
    day: input.dayKey || getDayKey(),
    degraded_count: input.degradedCount,
  });
}

export function emitDispatchCommandVisibilityDelta(input: WorkspaceMetricInput & {
  source: TelemetrySource;
  activeCount: number;
}) {
  const workspaceOwnerUserId = getWorkspaceOwnerUserId(input);
  const dayKey = input.dayKey || getDayKey();
  const snapshotKey = `${workspaceOwnerUserId}:${dayKey}`;
  const sourceKey = `${snapshotKey}:${input.source}`;
  const metrics = readMetrics();
  metrics.snapshots[sourceKey] = input.activeCount;
  writeMetrics(metrics);

  const dispatchCount = metrics.snapshots[`${snapshotKey}:dispatch_board`];
  const commandCount = metrics.snapshots[`${snapshotKey}:command_center`];
  const delta =
    typeof dispatchCount === "number" && typeof commandCount === "number"
      ? Math.abs(dispatchCount - commandCount)
      : null;

  emitMetric("dispatch_command_visibility_delta", {
    [LEGACY_TENANT_ID_METRIC_FIELD]: workspaceOwnerUserId,
    day: dayKey,
    dispatch_active_count: dispatchCount ?? null,
    command_center_active_count: commandCount ?? null,
    delta,
    last_source: input.source,
  });
}

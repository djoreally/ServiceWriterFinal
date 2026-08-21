import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { getAnonSessionId } from "@/lib/anonSession";

const HEARTBEAT_MS = 20_000;
const HIDDEN_HEARTBEAT_MS = 60_000;
const IDLE_TIMEOUT = 60_000;
const PRIMARY_KEY = "presence_primary_tab";
const CHANNEL_NAME = "presence";
const TAB_ID = crypto.randomUUID();
const LEGACY_TENANT_ID_COLUMN = "tenant_id" as const;
const PRESENCE_CONFLICT_TARGET = `${LEGACY_TENANT_ID_COLUMN},session_id`;

type PresenceStateType = "active" | "idle" | "offline";

interface PresenceState {
  workspaceOwnerUserId: string;
  visitorId: string;
  sessionId: string;
  currentPath: string;
  isPrimaryTab: boolean;
  presenceState: PresenceStateType;
  heartbeatTimer: ReturnType<typeof setInterval> | null;
  idleTimer: ReturnType<typeof setInterval> | null;
  channel: BroadcastChannel | null;
  lastActivity: number;
}

let state: PresenceState | null = null;

function electPrimaryTab() {
  const existing = localStorage.getItem(PRIMARY_KEY);
  if (!existing) {
    localStorage.setItem(PRIMARY_KEY, TAB_ID);
    return true;
  }
  return existing === TAB_ID;
}

async function upsertPresence(primary: boolean) {
  if (!state) return;
  const { error } = await supabase.from("visitor_presence").upsert(
    {
      [LEGACY_TENANT_ID_COLUMN]: state.workspaceOwnerUserId,
      visitor_id: state.visitorId,
      session_id: state.sessionId,
      current_path: state.currentPath,
      referrer: document.referrer || null,
      device_type: /Mobi|Android|iPhone/i.test(navigator.userAgent) ? "mobile" : "desktop",
      browser: navigator.userAgent,
      state: state.presenceState,
      primary_tab: primary,
      heartbeat_at: new Date().toISOString(),
      last_activity_at: new Date(state.lastActivity).toISOString(),
    },
    { onConflict: PRESENCE_CONFLICT_TARGET },
  );
  if (error) throw error;
}

async function heartbeat() {
  if (!state || !state.isPrimaryTab) return;
  await upsertPresence(true);
}

function markActivity() {
  if (!state) return;
  state.lastActivity = Date.now();
  if (state.presenceState !== "active") {
    state.presenceState = "active";
    void heartbeat();
  }
  state.channel?.postMessage({ type: "activity", at: state.lastActivity });
}

function startHeartbeatTimers() {
  if (!state) return;
  state.heartbeatTimer = setInterval(() => {
    if (!state) return;
    if (document.visibilityState === "hidden") {
      return;
    }
    void heartbeat();
  }, HEARTBEAT_MS);

  state.idleTimer = setInterval(() => {
    if (!state) return;
    const idleFor = Date.now() - state.lastActivity;
    if (idleFor > IDLE_TIMEOUT && state.presenceState !== "idle") {
      state.presenceState = "idle";
      void heartbeat();
    }
  }, 5000);
}

export async function startPresence(workspaceOwnerUserId: string): Promise<void> {
  if (!workspaceOwnerUserId || typeof window === "undefined") return;
  if (state?.workspaceOwnerUserId === workspaceOwnerUserId) return;
  stopPresence();

  const visitorId = getAnonSessionId();
  const sessionId = `${visitorId}:${TAB_ID}`;
  const channel = new BroadcastChannel(CHANNEL_NAME);

  state = {
    workspaceOwnerUserId,
    visitorId,
    sessionId,
    currentPath: window.location.pathname + window.location.search,
    isPrimaryTab: electPrimaryTab(),
    presenceState: "active",
    heartbeatTimer: null,
    idleTimer: null,
    channel,
    lastActivity: Date.now(),
  };

  channel.onmessage = (evt: MessageEvent<{ type?: string; at?: number }>) => {
    if (!state) return;
    const data = evt.data;
    if (data?.type === "primary-released") {
      state.isPrimaryTab = electPrimaryTab();
      if (state.isPrimaryTab) void heartbeat();
    }
    if (data?.type === "activity") {
      state.lastActivity = Math.max(state.lastActivity, Number(data.at ?? 0));
    }
  };

  await upsertPresence(state.isPrimaryTab);
  if (state.isPrimaryTab) startHeartbeatTimers();

  ["mousemove", "keydown", "scroll", "touchstart"].forEach((eventName) => {
    window.addEventListener(eventName, markActivity);
  });

  window.addEventListener("beforeunload", () => {
    if (!state) return;
    if (state.isPrimaryTab) {
      localStorage.removeItem(PRIMARY_KEY);
      state.channel?.postMessage({ type: "primary-released" });
    }
    void supabase
      .from("visitor_presence")
      .update({ state: "offline", disconnected_at: new Date().toISOString() })
      .eq(LEGACY_TENANT_ID_COLUMN, state.workspaceOwnerUserId)
      .eq("session_id", state.sessionId);
  });
}

export function updatePage(path: string): void {
  if (!state) return;
  state.currentPath = path;
  markActivity();
}

export async function trackEvent(eventName: string, metadata: Record<string, unknown> = {}) {
  if (!state) return;
  await supabase.from("analytics_events").insert({
    [LEGACY_TENANT_ID_COLUMN]: state.workspaceOwnerUserId,
    session_id: state.sessionId,
    event_name: eventName,
    metadata: metadata as Json,
  });
}

export function stopPresence(): void {
  if (!state) return;
  if (state.heartbeatTimer) clearInterval(state.heartbeatTimer);
  if (state.idleTimer) clearInterval(state.idleTimer);
  state.channel?.close();
  state = null;
}

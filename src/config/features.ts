const viteEnv = ((import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {}) as Record<string, string | undefined>;
const runtimeEnv = (typeof process !== "undefined" ? process.env : {}) as Record<string, string | undefined>;

function readEnv(key: string): string {
  return runtimeEnv[`NEXT_PUBLIC_${key}`] ?? runtimeEnv[key] ?? viteEnv[key] ?? '';
}

const getEnvValue = (key: string): string => readEnv(key);

export const features = {
  // Add your feature flags here
  get 'example-feature'() {
    return getEnvValue('VITE_FF_EXAMPLE_FEATURE') === 'true';
  },

  get 'offline-engine'() {
    const value = getEnvValue('VITE_FF_OFFLINE_ENGINE').toLowerCase();
    // Offline support is now enabled by default for every authenticated plan.
    // Set VITE_FF_OFFLINE_ENGINE=false or VITE_FF_OFFLINE_KILL_SWITCH=true to disable it.
    return value === '' ? true : value === 'true';
  },

  get 'offline-engine-allowlist'() {
    return getEnvValue('VITE_FF_OFFLINE_ENGINE_ALLOWLIST');
  },

  get 'offline-pilot-tenants'() {
    return getEnvValue('VITE_FF_OFFLINE_PILOT_TENANTS');
  },

  get 'offline-kill-switch'() {
    return getEnvValue('VITE_FF_OFFLINE_KILL_SWITCH') === 'true';
  },

  get 'offline-alert-outbox-depth'() {
    const value = Number(getEnvValue('VITE_FF_OFFLINE_ALERT_OUTBOX_DEPTH'));
    return Number.isFinite(value) && value > 0 ? value : 100;
  },
  get 'fleet-intake-kill-switch'() {
    return getEnvValue('VITE_FF_FLEET_INTAKE_KILL_SWITCH') === 'true';
  },
  get 'fleet-resource-scheduler-kill-switch'() {
    return getEnvValue('VITE_FF_FLEET_RESOURCE_SCHEDULER_KILL_SWITCH') === 'true';
  },
};

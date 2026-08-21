const getEnvValue = (key: string): string => {
  switch (key) {
    case 'VITE_FF_EXAMPLE_FEATURE':
      return import.meta.env.VITE_FF_EXAMPLE_FEATURE ?? '';
    case 'VITE_FF_OFFLINE_ENGINE':
      return import.meta.env.VITE_FF_OFFLINE_ENGINE ?? '';
    case 'VITE_FF_OFFLINE_ENGINE_ALLOWLIST':
      return import.meta.env.VITE_FF_OFFLINE_ENGINE_ALLOWLIST ?? '';
    case 'VITE_FF_OFFLINE_PILOT_TENANTS':
      return import.meta.env.VITE_FF_OFFLINE_PILOT_TENANTS ?? '';
    case 'VITE_FF_OFFLINE_KILL_SWITCH':
      return import.meta.env.VITE_FF_OFFLINE_KILL_SWITCH ?? '';
    case 'VITE_FF_OFFLINE_ALERT_OUTBOX_DEPTH':
      return import.meta.env.VITE_FF_OFFLINE_ALERT_OUTBOX_DEPTH ?? '';
    case 'VITE_FF_FLEET_INTAKE_KILL_SWITCH':
      return import.meta.env.VITE_FF_FLEET_INTAKE_KILL_SWITCH ?? '';
    case 'VITE_FF_FLEET_RESOURCE_SCHEDULER_KILL_SWITCH':
      return import.meta.env.VITE_FF_FLEET_RESOURCE_SCHEDULER_KILL_SWITCH ?? '';
    default:
      return '';
  }
};

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

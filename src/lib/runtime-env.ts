export type RuntimeEnvValue = string | boolean | undefined;
export type RuntimeEnvMap = Record<string, RuntimeEnvValue>;

declare global {
  var __RUNTIME_ENV__: RuntimeEnvMap | undefined;
}

export function getRuntimeEnv(): RuntimeEnvMap {
  if (globalThis.__RUNTIME_ENV__) return globalThis.__RUNTIME_ENV__;

  const runtimeGlobal = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  return runtimeGlobal.process?.env ?? {};
}

function canonicalKey(key: string): string {
  // Preserved modules may still pass a historical Vite-era key name. Treat it
  // only as an alias to the equivalent Next.js public key; never read a VITE_*
  // environment variable from the runtime. This keeps compatibility call sites
  // from becoming a second configuration contract.
  return key.startsWith('VITE_') ? `NEXT_PUBLIC_${key.slice('VITE_'.length)}` : key;
}

export function getRuntimeEnvString(key: string): string | undefined {
  const value = getRuntimeEnv()[canonicalKey(key)];
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return undefined;
}

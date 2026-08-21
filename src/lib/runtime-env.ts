export type RuntimeEnvValue = string | boolean | undefined;
export type RuntimeEnvMap = Record<string, RuntimeEnvValue>;

declare global {
  // Runtime Vite-like env bridge for non-Vite contexts (e.g. Jest).
  var __RUNTIME_ENV__: RuntimeEnvMap | undefined;
}

export function getRuntimeEnv(): RuntimeEnvMap {
  if (globalThis.__RUNTIME_ENV__) {
    return globalThis.__RUNTIME_ENV__;
  }

  const processEnv =
    typeof globalThis !== 'undefined' && 'process' in globalThis && (globalThis as any).process?.env
      ? ((globalThis as any).process.env as Record<string, string | undefined>)
      : undefined;

  return processEnv ?? {};
}

export function getRuntimeEnvString(key: string): string | undefined {
  const value = getRuntimeEnv()[key];
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return undefined;
}

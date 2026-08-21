import { useCallback, useState } from "react";

type OptimisticActionOptions<T, R = unknown> = {
  apply: (value: T) => void;
  rollback: (value: T) => void;
  run: (value: T) => Promise<R>;
  onSuccess?: (value: T, result: R) => void;
  onError?: (error: unknown, value: T) => void;
};

export const useOptimisticAction = <T, R = unknown>({ apply, rollback, run, onSuccess, onError }: OptimisticActionOptions<T, R>) => {
  const [pendingCount, setPendingCount] = useState(0);

  const executeWithResult = useCallback(async (value: T): Promise<{ ok: true; result: R } | { ok: false; error: unknown }> => {
    apply(value);
    setPendingCount((count) => count + 1);

    try {
      const result = await run(value);
      onSuccess?.(value, result);
      return { ok: true, result };
    } catch (error) {
      rollback(value);
      onError?.(error, value);
      return { ok: false, error };
    } finally {
      setPendingCount((count) => Math.max(0, count - 1));
    }
  }, [apply, onError, onSuccess, rollback, run]);

  const execute = useCallback(async (value: T) => {
    const result = await executeWithResult(value);
    return result.ok;
  }, [executeWithResult]);

  return { execute, executeWithResult, isPending: pendingCount > 0, pendingCount };
};

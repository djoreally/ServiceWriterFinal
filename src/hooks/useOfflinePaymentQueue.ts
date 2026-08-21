import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { processOfflinePayment } from "@/application/commands/offline-payment.command";
import { useOfflineSyncQueue, type OfflineSyncItem } from "@/hooks/useOfflineSyncQueue";
import { isOfflineEligibleForCurrentUser } from "@/offline/rollout";

interface QueuedPaymentPayload {
  [key: string]: unknown;
  amount: number;
  currency: string;
  customer_name: string | null;
  customer_email: string | null;
  appointment_id: string | null;
  payment_type: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

const STORAGE_KEY = "offline_payment_queue";

export const useOfflinePaymentQueue = () => {
  // Queue behavior uses canonical current-user eligibility.
  // Hidden UI is not enough: disabled must be fully dormant via `enabled` downstream.
  const [isOfflineQueueEnabled, setIsOfflineQueueEnabled] = useState(false);

  useEffect(() => {
    let isActive = true;

    void isOfflineEligibleForCurrentUser()
      .then((eligible) => {
        if (isActive) {
          setIsOfflineQueueEnabled(eligible);
        }
      })
      .catch(() => {
        if (isActive) {
          setIsOfflineQueueEnabled(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  const queueState = useOfflineSyncQueue<QueuedPaymentPayload>({
    storageKey: STORAGE_KEY,
    queueType: "payment",
    processItem: async (item: OfflineSyncItem<QueuedPaymentPayload>) => {
      await processOfflinePayment(item.payload);
    },
    staleAfterMs: 1000 * 60 * 60 * 24 * 3, // 72h stale protection
    maxAttempts: 5,
    enabled: isOfflineQueueEnabled,
  });

  const addToQueue = useCallback((payment: {
    amount: number;
    currency: string;
    customer_name: string | null;
    customer_email: string | null;
    appointment_id: string | null;
    payment_type: string;
    metadata?: Record<string, unknown>;
  }) => {
    const createdAt = new Date().toISOString();
    const entityKey = payment.appointment_id
      ? `appointment:${payment.appointment_id}:${payment.payment_type}`
      : `payment:${crypto.randomUUID()}`;

    if (isOfflineQueueEnabled) {
      queueState.enqueue({
        entityKey,
        payload: { ...payment, created_at: createdAt } as QueuedPaymentPayload,
      });

      toast.info("Payment queued for processing when online");
    }

    return entityKey;
  }, [isOfflineQueueEnabled, queueState]);

  const processQueue = useCallback(async () => {
    if (!isOfflineQueueEnabled) {
      return;
    }

    await queueState.processQueue();

    if (queueState.queueCount === 0) {
      toast.success("Queued payments are synchronized");
    }
  }, [isOfflineQueueEnabled, queueState]);

  return {
    queue: queueState.queue,
    isOnline: queueState.isOnline,
    isProcessing: queueState.isProcessing,
    queueCount: queueState.queueCount,
    isOfflineQueueEnabled,
    addToQueue,
    removeFromQueue: queueState.removeItem,
    processQueue,
    clearQueue: () => {
      if (!isOfflineQueueEnabled) {
        return;
      }

      for (const item of queueState.queue) {
        queueState.removeItem(item.id);
      }
    },
  };
};

export default useOfflinePaymentQueue;

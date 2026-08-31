let mockCurrentDb: any = null;
const mockRpc = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/offline/database', () => ({
  getOfflineDatabase: () => mockCurrentDb,
}));

jest.mock('@/offline/rollout', () => ({
  isOfflineEligibleForCurrentUser: jest.fn(async () => true),
}));

jest.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

import {
  enqueueServiceCatalogEdit,
  processOfflineOutbox,
  retryDeadLetterOutboxItem,
  discardDeadLetterOutboxItem,
} from '@/offline/outbox';

type RawMutation = {
  mutation_id: string;
  entity: string;
  operation: string;
  payload: string;
  status: string;
  attempt_count: number;
  next_retry_at?: number | null;
  last_error?: string | null;
  dead_letter_reason?: string | null;
  updated_at?: number;
};

function createMutation(raw: RawMutation) {
  const mutation: { _raw: RawMutation; update: (fn: (rec: { _raw: RawMutation }) => void) => Promise<void> } = {
    _raw: { ...raw },
    update: async (fn) => {
      fn(mutation);
    },
  };
  return mutation;
}

function createDb(mutations: ReturnType<typeof createMutation>[]) {
  return {
    get: jest.fn((table: string) => {
      if (table !== 'offline_outbox') throw new Error('Unexpected table');
      return {
        query: jest.fn(() => ({
          fetch: jest.fn(async () => mutations),
        })),
      };
    }),
    write: async (fn: () => Promise<void>) => fn(),
  };
}

describe('Phase 5 offline outbox QA scenarios', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentDb = null;
  });

  it('network flap: marks mutation failed and schedules backoff retry', async () => {
    mockRpc.mockResolvedValueOnce({ error: new Error('temporary network failure') });

    const mutation = createMutation({
      mutation_id: 'inventory-van-1-item-1',
      entity: 'inventory',
      operation: 'transfer',
      payload: JSON.stringify({ itemId: 'item-1', vanId: 'van-1', quantity: 2 }),
      status: 'pending',
      attempt_count: 0,
    });

    mockCurrentDb = createDb([mutation]);

    await processOfflineOutbox();

    expect(mutation._raw.status).toBe('failed');
    expect(mutation._raw.attempt_count).toBe(1);
    expect(Number(mutation._raw.next_retry_at)).toBeGreaterThan(Date.now() - 1);
  });

  it('conflict storm simulation: escalates to dead-letter after max attempts', async () => {
    mockRpc.mockResolvedValue({ error: new Error('temporary network failure') });

    const mutation = createMutation({
      mutation_id: 'inventory-van-1-item-1',
      entity: 'inventory',
      operation: 'transfer',
      payload: JSON.stringify({ itemId: 'item-1', vanId: 'van-1', quantity: 2 }),
      status: 'pending',
      attempt_count: 0,
      next_retry_at: null,
    });

    mockCurrentDb = createDb([mutation]);

    for (let i = 0; i < 6; i += 1) {
      mutation._raw.next_retry_at = null;
      await processOfflineOutbox();
    }

    expect(mutation._raw.status).toBe('dead_letter');
    expect(mutation._raw.dead_letter_reason).toContain('Max retry attempts');
  });

  it('dead-letter operator controls: retry resets state and discard marks discarded', async () => {
    const mutation = createMutation({
      mutation_id: 'inventory-van-1-item-1',
      entity: 'inventory',
      operation: 'transfer',
      payload: JSON.stringify({ itemId: 'item-1', vanId: 'van-1', quantity: 2 }),
      status: 'dead_letter',
      attempt_count: 6,
      dead_letter_reason: 'Max retry attempts exceeded',
      next_retry_at: null,
    });

    mockCurrentDb = createDb([mutation]);

    await retryDeadLetterOutboxItem('inventory-van-1-item-1');
    expect(mutation._raw.status).toBe('failed');
    expect(mutation._raw.attempt_count).toBe(0);

    await discardDeadLetterOutboxItem('inventory-van-1-item-1');
    expect(mutation._raw.status).toBe('discarded');
  });

  it('preserves the service item ID and data for an offline update replay', async () => {
    const created = { _raw: {} as Record<string, unknown> };
    mockCurrentDb = {
      get: jest.fn(() => ({
        create: jest.fn(async (initialize: (record: typeof created) => void) => {
          initialize(created);
          return created;
        }),
      })),
      write: async (fn: () => Promise<void>) => fn(),
    };

    await enqueueServiceCatalogEdit({
      action: 'update',
      itemId: 'service-123',
      data: { name: 'Synthetic oil change' },
    });

    expect(JSON.parse(String(created._raw.payload))).toEqual({
      action: 'update',
      itemId: 'service-123',
      data: { name: 'Synthetic oil change' },
    });
  });
});

import {
  schemaMigrations,
  createTable,
  addColumns,
} from '@nozbe/watermelondb/Schema/migrations';

export const offlineMigrations = schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        createTable({
          name: 'offline_outbox',
          columns: [
            { name: 'mutation_id', type: 'string', isIndexed: true },
            { name: 'entity', type: 'string', isIndexed: true },
            { name: 'operation', type: 'string', isIndexed: true },
            { name: 'payload', type: 'string' },
            { name: 'created_at', type: 'number', isIndexed: true },
            { name: 'updated_at', type: 'number' },
            { name: 'status', type: 'string', isIndexed: true },
            { name: 'attempt_count', type: 'number' },
            { name: 'next_retry_at', type: 'number', isOptional: true, isIndexed: true },
            { name: 'last_error', type: 'string', isOptional: true },
            { name: 'idempotency_key', type: 'string', isIndexed: true },
          ],
        }),
      ],
    },
    {
      toVersion: 3,
      steps: [
        addColumns({
          table: 'offline_outbox',
          columns: [
            { name: 'acked_at', type: 'number', isOptional: true, isIndexed: true },
            { name: 'dead_letter_reason', type: 'string', isOptional: true },
          ],
        }),
        createTable({
          name: 'offline_sync_state',
          columns: [
            { name: 'entity', type: 'string', isIndexed: true },
            { name: 'cursor', type: 'string', isOptional: true },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      toVersion: 4,
      steps: [
        createTable({
          name: 'offline_fleet_work_orders',
          columns: [
            { name: 'server_id', type: 'string', isIndexed: true },
            { name: 'order_number', type: 'string', isOptional: true },
            { name: 'status', type: 'string', isOptional: true, isIndexed: true },
            { name: 'priority', type: 'string', isOptional: true },
            { name: 'scheduled_date', type: 'string', isOptional: true },
            { name: 'service_type', type: 'string', isOptional: true },
            { name: 'po_number', type: 'string', isOptional: true },
            { name: 'total', type: 'number', isOptional: true },
            { name: 'vehicle_server_id', type: 'string', isOptional: true, isIndexed: true },
            { name: 'client_server_id', type: 'string', isOptional: true, isIndexed: true },
            { name: 'updated_at_server', type: 'number', isOptional: true },
            { name: 'updated_at_local', type: 'number' },
            { name: 'sync_status', type: 'string', isIndexed: true },
            { name: 'is_deleted', type: 'boolean' },
          ],
        }),
        createTable({
          name: 'offline_service_catalog',
          columns: [
            { name: 'server_id', type: 'string', isIndexed: true },
            { name: 'name', type: 'string', isOptional: true },
            { name: 'category', type: 'string', isOptional: true },
            { name: 'default_price', type: 'number', isOptional: true },
            { name: 'is_active', type: 'boolean' },
            { name: 'sort_order', type: 'number', isOptional: true },
            { name: 'updated_at_server', type: 'number', isOptional: true },
            { name: 'updated_at_local', type: 'number' },
            { name: 'sync_status', type: 'string', isIndexed: true },
            { name: 'is_deleted', type: 'boolean' },
          ],
        }),
        createTable({
          name: 'offline_technician_messages',
          columns: [
            { name: 'server_id', type: 'string', isIndexed: true },
            { name: 'appointment_server_id', type: 'string', isOptional: true, isIndexed: true },
            { name: 'message_type', type: 'string', isOptional: true, isIndexed: true },
            { name: 'title', type: 'string', isOptional: true },
            { name: 'body', type: 'string', isOptional: true },
            { name: 'created_at_server', type: 'number', isOptional: true, isIndexed: true },
            { name: 'updated_at_server', type: 'number', isOptional: true },
            { name: 'updated_at_local', type: 'number' },
            { name: 'sync_status', type: 'string', isIndexed: true },
            { name: 'is_deleted', type: 'boolean' },
          ],
        }),
      ],
    },
  ],
});

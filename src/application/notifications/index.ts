/**
 * Lifecycle email is intentionally server-only.
 *
 * Browser code must call the authenticated domain API that performs the state
 * transition. That API then dispatches through `src/server/messaging`, where
 * the message is written to the durable lifecycle outbox. Keeping this module
 * export-free prevents new client code from reviving the retired Supabase
 * `send-email` Edge Function path.
 */
export {};

/**
 * Application Layer - Public API
 * 
 * Commands: Write operations (create, update, delete)
 * Queries: Read operations (fetch, list)
 * Notifications: Email and alert services
 * 
 * UI components should import from here, not from infrastructure directly.
 */

export * from './commands';
export * from './queries';
export * from './notifications';

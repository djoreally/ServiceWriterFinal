/**
 * Backwards-compatible entry point. The policy itself now lives in
 * `access-policy.ts` so navigation, route guards and `RequireAuth` share
 * exactly one matrix.
 */
export {
  canAccessRoute,
  canWrite,
  ROUTE_ACCESS,
  type AccessRole,
  type RouteAccessRule,
  type WriteArea,
} from "./access-policy";

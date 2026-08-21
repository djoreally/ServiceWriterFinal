import type { JobRuntime } from "@/domain/jobs/job-runtime";
import type { TrustContext } from "@/domain/auth/build-trust-context";

function hasPermission(ctx: TrustContext, permission: string): boolean {
  return ctx.permissions.includes(permission);
}

export function canViewJob(runtime: JobRuntime, trustContext: TrustContext): boolean {
  if (trustContext.role === "owner" || trustContext.role === "manager") return runtime.orgId === trustContext.orgId;
  return runtime.trust.visibleToUser && hasPermission(trustContext, "jobs.read");
}

export function canEditJob(runtime: JobRuntime, trustContext: TrustContext): boolean {
  return canViewJob(runtime, trustContext)
    && runtime.trust.editableByUser
    && hasPermission(trustContext, "jobs.write");
}

export function canTransitionJob(runtime: JobRuntime, trustContext: TrustContext): boolean {
  return canViewJob(runtime, trustContext)
    && hasPermission(trustContext, "jobs.transition")
    && runtime.lifecycle.status !== "completed"
    && runtime.lifecycle.status !== "cancelled"
    && runtime.lifecycle.status !== "no_show";
}

export function canViewFinancials(runtime: JobRuntime, trustContext: TrustContext): boolean {
  return canViewJob(runtime, trustContext) && hasPermission(trustContext, "financials.read");
}

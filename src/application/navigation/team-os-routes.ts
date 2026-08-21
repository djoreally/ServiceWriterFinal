export const TEAM_OS_MODULES = [
  "overview",
  "roster",
  "schedule",
  "skills",
  "compliance",
  "development",
  "compensation",
  "access",
] as const;

export type TeamOsModule = (typeof TEAM_OS_MODULES)[number];

export function isTeamOsModule(value: string | null): value is TeamOsModule {
  return TEAM_OS_MODULES.includes(value as TeamOsModule);
}

export function getTeamOsPath(options: {
  module?: TeamOsModule;
  technicianId?: string | null;
  query?: string;
  attentionOnly?: boolean;
  rosterState?: "active" | "inactive" | "linked" | "invited" | "roster_only";
} = {}): string {
  const params = new URLSearchParams();
  if (options.module && options.module !== "overview") params.set("module", options.module);
  if (options.technicianId) params.set("tech", options.technicianId);
  if (options.query?.trim()) params.set("q", options.query.trim());
  if (options.attentionOnly) params.set("attention", "1");
  if (options.rosterState) params.set("state", options.rosterState);
  const queryString = params.toString();
  return `/team-os${queryString ? `?${queryString}` : ""}`;
}

export function getTeamOsModule(value: string | null): TeamOsModule {
  return isTeamOsModule(value) ? value : "overview";
}

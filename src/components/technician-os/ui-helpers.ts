export const SKILL_TYPES = [
  "oil_change", "brakes", "fleet_diesel", "transmission", "tires",
  "electrical", "hvac", "engine_diagnostics", "suspension", "exhaust",
  "coolant_flush", "alignment", "inspection", "detailing",
];

export const getScoreColor = (score: number | null) => {
  if (!score) return "text-muted-foreground";
  if (score >= 75) return "text-gray-600";
  if (score >= 50) return "text-yellow-600";
  return "text-red-600";
};

export const getScoreBg = (score: number | null) => {
  if (!score) return "bg-muted";
  if (score >= 75) return "bg-gray-500";
  if (score >= 50) return "bg-yellow-500";
  return "bg-red-500";
};

export const getStatusBadge = (status: string) => {
  const map: Record<string, string> = {
    active: "bg-gray-100 text-gray-800",
    available: "bg-gray-100 text-gray-800",
    offline: "bg-muted text-muted-foreground",
    on_break: "bg-yellow-100 text-yellow-800",
    suspended: "bg-red-100 text-red-800",
    en_route: "bg-blue-100 text-blue-800",
  };
  return map[status] || "bg-muted text-muted-foreground";
};

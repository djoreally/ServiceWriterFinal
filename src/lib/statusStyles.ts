export const statusBadgeClasses = {
  completed:
    "bg-[hsl(var(--status-completed-bg))] text-[hsl(var(--status-completed-text))] border-[hsl(var(--status-completed-text)/0.2)]",
  inProgress:
    "bg-[hsl(var(--status-inprogress-bg))] text-[hsl(var(--status-inprogress-text))] border-[hsl(var(--status-inprogress-text)/0.2)]",
  scheduled:
    "bg-[hsl(var(--status-scheduled-bg))] text-[hsl(var(--status-scheduled-text))] border-[hsl(var(--status-scheduled-text)/0.2)]",
  awaiting:
    "bg-[hsl(var(--status-awaiting-bg))] text-[hsl(var(--status-awaiting-text))] border-[hsl(var(--status-awaiting-text)/0.2)]",
  critical:
    "bg-[hsl(var(--alert-critical-bg))] text-[hsl(var(--alert-critical-text))] border-[hsl(var(--alert-critical-text)/0.2)]",
} as const;

const serviceStatusLabels: Record<string, string> = {
  completed: "Completed",
  in_progress: "In Progress",
  "in-progress": "In Progress",
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  pending: "Pending",
  no_show: "No Show",
  cancelled: "Cancelled",
};

export const getServiceStatusLabel = (status: string) =>
  serviceStatusLabels[status.toLowerCase()] || status;

export const getServiceStatusBadgeClass = (status: string) => {
  switch (status.toLowerCase()) {
    case "completed":
      return statusBadgeClasses.completed;
    case "in_progress":
    case "in-progress":
      return statusBadgeClasses.inProgress;
    case "scheduled":
    case "confirmed":
      return statusBadgeClasses.scheduled;
    case "pending":
    case "no_show":
      return statusBadgeClasses.awaiting;
    case "cancelled":
      return statusBadgeClasses.critical;
    default:
      return null;
  }
};

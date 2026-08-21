export const FLEET_INVOICE_WORKFLOW_PATH = "/fleet-os/work-orders/invoicing";

/** Centralized handoff target for every Fleet OS invoice entry point. */
export function getFleetInvoiceWorkflowPath(clientId?: string): string {
  if (!clientId) return FLEET_INVOICE_WORKFLOW_PATH;
  return `${FLEET_INVOICE_WORKFLOW_PATH}?client=${encodeURIComponent(clientId)}`;
}

export function openFleetInvoiceWorkflow(navigate: (path: string) => void, clientId?: string): void {
  navigate(getFleetInvoiceWorkflowPath(clientId));
}

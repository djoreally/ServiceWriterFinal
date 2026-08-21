import {
  FLEET_INVOICE_WORKFLOW_PATH,
  getFleetInvoiceWorkflowPath,
  openFleetInvoiceWorkflow,
} from "../fleet-invoice-routes";

describe("Fleet invoice route handoffs", () => {
  it("sends every invoice entry point to the ready-to-invoice workflow", () => {
    expect(getFleetInvoiceWorkflowPath()).toBe("/fleet-os/work-orders/invoicing");
    expect(getFleetInvoiceWorkflowPath()).toBe(FLEET_INVOICE_WORKFLOW_PATH);
  });

  it("hands the workflow path to React Router navigation", () => {
    const navigate = jest.fn();

    openFleetInvoiceWorkflow(navigate);

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(FLEET_INVOICE_WORKFLOW_PATH);
  });

  it("preserves the originating client as an encoded workflow filter", () => {
    const navigate = jest.fn();

    openFleetInvoiceWorkflow(navigate, "client/one");

    expect(navigate).toHaveBeenCalledWith(`${FLEET_INVOICE_WORKFLOW_PATH}?client=client%2Fone`);
  });
});

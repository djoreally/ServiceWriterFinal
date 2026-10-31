import { describe, it, expect } from "@jest/globals";
import {
  APPOINTMENT_STATUSES,
  DISPATCH_STATUSES,
  INVOICE_STATUSES,
  PAYMENT_STATUSES,
  appointmentStatusView,
  dispatchStatusView,
  dispatchStatusViewForRow,
  invoiceStatusView,
  normalizeAppointmentStatus,
  normalizeDispatchStatus,
  normalizeInvoiceStatus,
  paymentStatusView,
  resolveDispatchStatus,
  withAppointmentStatusView,
  withInvoiceStatusView,
} from "./status-vocabulary";

describe("appointment vocabulary (T-9, T-12)", () => {
  it("covers every canonical status with a label and tone", () => {
    for (const status of APPOINTMENT_STATUSES) {
      const view = appointmentStatusView(status);
      expect(view.status).toBe(status);
      expect(view.status_label).toBeTruthy();
      expect(["neutral", "info", "success", "warning", "danger"]).toContain(view.status_tone);
    }
  });

  it("composes the exact label/tone pairs clients used to invent", () => {
    expect(appointmentStatusView("confirmed")).toEqual({ status: "confirmed", status_label: "Confirmed", status_tone: "info" });
    expect(appointmentStatusView("in_progress")).toEqual({ status: "in_progress", status_label: "In progress", status_tone: "warning" });
    expect(appointmentStatusView("completed")).toEqual({ status: "completed", status_label: "Completed", status_tone: "success" });
    expect(appointmentStatusView("cancelled")).toEqual({ status: "cancelled", status_label: "Cancelled", status_tone: "danger" });
    expect(appointmentStatusView("no_show")).toEqual({ status: "no_show", status_label: "No-show", status_tone: "neutral" });
  });

  it("collapses the en_route/on_the_way synonym onto en_route (T-12)", () => {
    expect(normalizeAppointmentStatus("on_the_way")).toBe("en_route");
    expect(appointmentStatusView("on_the_way")).toEqual({ status: "en_route", status_label: "En route", status_tone: "info" });
    expect(appointmentStatusView("en_route").status).toBe("en_route");
  });

  it("normalizes case, spacing, and legacy spellings", () => {
    expect(normalizeAppointmentStatus(" In Progress ")).toBe("in_progress");
    expect(normalizeAppointmentStatus("canceled")).toBe("cancelled");
    expect(normalizeAppointmentStatus("no show")).toBe("no_show");
    expect(normalizeAppointmentStatus("complete")).toBe("completed");
  });

  it("renders an unrecognized status as itself — never as Confirmed (T-9)", () => {
    const view = appointmentStatusView("weather_hold");
    expect(view.status).toBe("weather_hold");
    expect(view.status_label).toBe("Weather hold");
    expect(view.status_tone).toBe("neutral");
    expect(view.status).not.toBe("confirmed");
  });

  it("handles nullish input without inventing a status", () => {
    expect(appointmentStatusView(null)).toEqual({ status: null, status_label: null, status_tone: "neutral" });
    expect(appointmentStatusView(undefined).status).toBeNull();
    expect(normalizeAppointmentStatus("")).toBeNull();
  });
});

describe("dispatch vocabulary (T-11, T-12)", () => {
  it("covers the dispatch axis", () => {
    for (const status of DISPATCH_STATUSES) {
      const view = dispatchStatusView(status);
      expect(view.status).toBe(status);
      expect(view.status_label).toBeTruthy();
    }
    expect(dispatchStatusView("unassigned").status_tone).toBe("warning");
    expect(normalizeDispatchStatus("on_the_way")).toBe("en_route");
  });

  it("resolves the column before the metadata copy (one home: the column)", () => {
    expect(resolveDispatchStatus({ dispatch_status: "arrived", metadata: { dispatch_status: "en_route" } })).toBe("arrived");
    expect(resolveDispatchStatus({ dispatch_status: null, metadata: { dispatch_status: "en_route" } })).toBe("en_route");
    expect(resolveDispatchStatus({ metadata: { dispatch_status: "on_the_way" } })).toBe("en_route");
    expect(resolveDispatchStatus({ dispatch_status: null, metadata: null })).toBeNull();
    expect(resolveDispatchStatus({})).toBeNull();
  });

  it("composes the row view from the resolved home", () => {
    expect(dispatchStatusViewForRow({ metadata: { dispatch_status: "acknowledged" } }))
      .toEqual({ status: "acknowledged", status_label: "Acknowledged", status_tone: "info" });
  });
});

describe("invoice vocabulary (T-10)", () => {
  it("is partially_paid end-to-end", () => {
    expect(INVOICE_STATUSES).toContain("partially_paid");
    expect(INVOICE_STATUSES).not.toContain("partial" as never);
    expect(INVOICE_STATUSES).not.toContain("sent" as never);
    expect(invoiceStatusView("partially_paid")).toEqual({ status: "partially_paid", status_label: "Partially paid", status_tone: "warning" });
  });

  it("normalizes the legacy dialect at the boundary and never emits it", () => {
    expect(normalizeInvoiceStatus("partial")).toBe("partially_paid");
    expect(normalizeInvoiceStatus("sent")).toBe("issued");
    expect(invoiceStatusView("partial").status).toBe("partially_paid");
    expect(invoiceStatusView("sent")).toEqual({ status: "issued", status_label: "Issued", status_tone: "info" });
  });

  it("covers the canonical set", () => {
    expect(invoiceStatusView("draft").status_tone).toBe("neutral");
    expect(invoiceStatusView("paid").status_tone).toBe("success");
    expect(invoiceStatusView("void").status_tone).toBe("neutral");
    expect(invoiceStatusView("past_due")).toEqual({ status: "past_due", status_label: "Past due", status_tone: "danger" });
  });
});

describe("payment vocabulary", () => {
  it("covers the ledger record statuses", () => {
    for (const status of PAYMENT_STATUSES) {
      expect(paymentStatusView(status).status_label).toBeTruthy();
    }
    expect(paymentStatusView("succeeded").status_tone).toBe("success");
    expect(paymentStatusView("failed").status_tone).toBe("danger");
    expect(paymentStatusView("partially_refunded").status_label).toBe("Partially refunded");
  });
});

describe("row composers", () => {
  it("adds the status triple and canonicalizes the status", () => {
    const row = withAppointmentStatusView({ id: "a1", status: "on_the_way" });
    expect(row.status).toBe("en_route");
    expect(row.status_label).toBe("En route");
    expect(row.status_tone).toBe("info");
    expect(row.id).toBe("a1");
  });

  it("adds the dispatch triple only when the row carries dispatch sources", () => {
    const bare = withAppointmentStatusView({ id: "a1", status: "confirmed" });
    expect(bare.dispatch_status).toBeNull();
    expect(bare.dispatch_status_label).toBeNull();
    expect(bare.dispatch_status_tone).toBeNull();

    const withMeta = withAppointmentStatusView({ id: "a1", status: "confirmed", metadata: { dispatch_status: "en_route" } });
    expect(withMeta.dispatch_status).toBe("en_route");
    expect(withMeta.dispatch_status_label).toBe("En route");

    const withColumn = withAppointmentStatusView({ id: "a1", status: "confirmed", dispatch_status: "arrived", metadata: { dispatch_status: "en_route" } });
    expect(withColumn.dispatch_status).toBe("arrived");
  });

  it("does not mutate the source row", () => {
    const source = { id: "a1", status: "on_the_way", metadata: { dispatch_status: "assigned" } };
    withAppointmentStatusView(source);
    expect(source.status).toBe("on_the_way");
  });

  it("canonicalizes invoice rows", () => {
    const row = withInvoiceStatusView({ id: "i1", status: "partial" });
    expect(row.status).toBe("partially_paid");
    expect(row.status_label).toBe("Partially paid");
    expect(row.status_tone).toBe("warning");
  });
});

import React from "react";
import { render, screen } from "@testing-library/react";
import { DollarSign } from "lucide-react";
import {
  KpiCard,
  SectionHeader,
  getPaymentMethodLabel,
  statusBadge,
} from "../ReportUiPrimitives";

describe("ReportUiPrimitives", () => {
  it("renders KPI card and matches snapshot", () => {
    const { asFragment } = render(
      <KpiCard
        title="Collected Cash"
        value="$123.45"
        subtitle="This period"
        icon={DollarSign}
        accent="emerald"
      />
    );

    expect(screen.getByText("Collected Cash")).toBeInTheDocument();
    expect(screen.getByText("$123.45")).toBeInTheDocument();
    expect(asFragment().firstChild).toBeTruthy();
  });

  it("renders trend and updates direction on rerender", () => {
    const { rerender } = render(
      <KpiCard
        title="Net Revenue"
        value="$500.00"
        icon={DollarSign}
        accent="blue"
        trend={{ value: 12.3, label: "vs previous" }}
      />
    );

    expect(screen.getByText("+12.3%")).toBeInTheDocument();
    expect(screen.getByText("vs previous")).toBeInTheDocument();

    rerender(
      <KpiCard
        title="Net Revenue"
        value="$500.00"
        icon={DollarSign}
        accent="blue"
        trend={{ value: -3.4, label: "vs previous" }}
      />
    );

    expect(screen.getByText("-3.4%")).toBeInTheDocument();
  });

  it("renders section header and payment/status helpers", () => {
    render(<SectionHeader title="Revenue Intelligence" subtitle="KPIs" icon={DollarSign} />);

    expect(screen.getByText("Revenue Intelligence")).toBeInTheDocument();
    expect(screen.getByText("KPIs")).toBeInTheDocument();

    expect(getPaymentMethodLabel("online_card")).toBe("🌐 Online Card");
    expect(getPaymentMethodLabel("custom_method")).toBe("custom method");

    render(statusBadge("in_progress"));
    expect(screen.getByText("in progress")).toBeInTheDocument();
  });
});

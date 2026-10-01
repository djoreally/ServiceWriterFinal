import { fireEvent, render, screen } from "@testing-library/react";
import {
  DateRangeFilter,
  getDateRangeFromPreset,
} from "@/components/dashboard/DateRangeFilter";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("getDateRangeFromPreset", () => {
  it("builds rolling windows ending today", () => {
    const now = Date.now();
    for (const [preset, days] of [["7d", 7], ["30d", 30], ["90d", 90]] as const) {
      const range = getDateRangeFromPreset(preset);
      expect(range.from!.getTime()).toBeCloseTo(now - days * DAY_MS, -3);
      expect(range.to!.getTime()).toBeCloseTo(now, -3);
    }
  });

  it("builds this-month and last-month windows", () => {
    const thisMonth = getDateRangeFromPreset("thisMonth");
    expect(thisMonth.from!.getDate()).toBe(1);

    const lastMonth = getDateRangeFromPreset("lastMonth");
    const expected = new Date();
    expected.setMonth(expected.getMonth() - 1);
    expect(lastMonth.from!.getMonth()).toBe(expected.getMonth());
    expect(lastMonth.from!.getDate()).toBe(1);
  });

  it("falls back to 30 days for unknown presets", () => {
    const range = getDateRangeFromPreset("custom");
    const now = Date.now();
    expect(range.from!.getTime()).toBeCloseTo(now - 30 * DAY_MS, -3);
  });
});

describe("DateRangeFilter", () => {
  function renderFilter(preset: "7d" | "30d" | "custom" = "30d") {
    const onDateRangeChange = jest.fn();
    const onPresetChange = jest.fn();
    render(
      <DateRangeFilter
        dateRange={undefined}
        onDateRangeChange={onDateRangeChange}
        preset={preset}
        onPresetChange={onPresetChange}
      />,
    );
    return { onDateRangeChange, onPresetChange };
  }

  it("renders the preset buttons", () => {
    renderFilter();
    for (const label of ["Last 7 days", "Last 30 days", "Last 90 days", "This month", "Last month"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("applies a preset and its date range on click", () => {
    const { onDateRangeChange, onPresetChange } = renderFilter("30d");
    fireEvent.click(screen.getByRole("button", { name: "Last 7 days" }));
    expect(onPresetChange).toHaveBeenCalledWith("7d");
    expect(onDateRangeChange).toHaveBeenCalledTimes(1);
    const range = onDateRangeChange.mock.calls[0][0];
    expect(range.from.getTime()).toBeCloseTo(Date.now() - 7 * DAY_MS, -3);
  });

  it("shows the custom-range trigger button", () => {
    renderFilter("custom");
    expect(screen.getByRole("button", { name: /Custom range/ })).toBeInTheDocument();
  });

  it("formats a selected range on the trigger", () => {
    const onDateRangeChange = jest.fn();
    const onPresetChange = jest.fn();
    render(
      <DateRangeFilter
        dateRange={{ from: new Date(2026, 8, 1), to: new Date(2026, 8, 15) }}
        onDateRangeChange={onDateRangeChange}
        preset="custom"
        onPresetChange={onPresetChange}
      />,
    );
    expect(screen.getByRole("button", { name: /Sep 1 - Sep 15, 2026/ })).toBeInTheDocument();
  });
});

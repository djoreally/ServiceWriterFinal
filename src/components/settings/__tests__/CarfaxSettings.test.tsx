/**
 * SW-86: the CARFAX settings screen binding.
 *
 * The screen existed in the codebase for months while nothing mounted it
 * (audit gap G7). These tests pin the behavior that makes the hosted
 * screen actually work in production's real state: the MOMS workspace is
 * already enrolled (the server derives carfax_activated from the saved
 * location ID), so the location form must render — and show the saved
 * value — in the activated state too, with the manual export actions and
 * the export monitor on the same screen.
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

jest.mock("@/application/queries/carfax.query", () => ({
  fetchCarfaxSettings: jest.fn(),
  fetchCarfaxExports: jest.fn(),
  fetchCarfaxDataStats: jest.fn(),
}));

jest.mock("@/application/commands/carfax.command", () => ({
  saveCarfaxSettings: jest.fn(),
  recordCarfaxExport: jest.fn(),
  fetchCarfaxExportServices: jest.fn(),
  activateCarfaxShop: jest.fn(),
  formatCarfaxFeed: jest.fn(() => ""),
}));

jest.mock("@/application/queries/carfax-exports.query", () => ({
  fetchCarfaxExportHistory: jest.fn(),
  fetchCarfaxExportStats: jest.fn(),
  fetchTodaysExports: jest.fn(),
  fetchLatestExport: jest.fn(),
}));

import { CarfaxSettings } from "@/components/settings/CarfaxSettings";
import {
  fetchCarfaxSettings,
  fetchCarfaxExports,
  fetchCarfaxDataStats,
} from "@/application/queries/carfax.query";
import { saveCarfaxSettings } from "@/application/commands/carfax.command";
import {
  fetchCarfaxExportHistory,
  fetchCarfaxExportStats,
  fetchTodaysExports,
} from "@/application/queries/carfax-exports.query";

const fetchSettingsMock = fetchCarfaxSettings as unknown as jest.Mock;
const fetchExportsMock = fetchCarfaxExports as unknown as jest.Mock;
const fetchStatsMock = fetchCarfaxDataStats as unknown as jest.Mock;
const saveMock = saveCarfaxSettings as unknown as jest.Mock;
const fetchHistoryMock = fetchCarfaxExportHistory as unknown as jest.Mock;
const fetchExportStatsMock = fetchCarfaxExportStats as unknown as jest.Mock;
const fetchTodayMock = fetchTodaysExports as unknown as jest.Mock;

/** The production MOMS workspace shape: location ID written before the
 *  screen was hosted, activation derived from it server-side. */
const enrolledSettings = {
  carfax_location_id: "servicewriter01",
  city: "Ambler",
  state: "PA",
  postal_code: "19002",
  website_url: "https://momsoilchange.com",
  business_name: "MOMS Mobile Oil Change",
  address: "428 Railroad Avenue",
  phone: "215-767-2125",
  carfax_activated: true,
  carfax_activation_date: "2026-11-13T15:00:00.000Z",
};

const unenrolledSettings = {
  carfax_location_id: "",
  city: "",
  state: "",
  postal_code: "",
  website_url: "",
  business_name: "",
  address: "",
  phone: "",
  carfax_activated: false,
  carfax_activation_date: null,
};

beforeEach(() => {
  fetchExportsMock.mockResolvedValue([]);
  fetchStatsMock.mockResolvedValue({ totalServices: 31, validVins: 24, missingData: 0 });
  fetchHistoryMock.mockResolvedValue([]);
  fetchExportStatsMock.mockResolvedValue({
    totalExports: 0,
    successfulExports: 0,
    failedExports: 0,
    totalRecordsExported: 0,
  });
  fetchTodayMock.mockResolvedValue([]);
  saveMock.mockResolvedValue(undefined);
});

describe("CarfaxSettings (SW-86)", () => {
  it("shows the saved location ID to an enrolled shop, with export and monitor on the same screen", async () => {
    fetchSettingsMock.mockResolvedValue(enrolledSettings);
    render(<CarfaxSettings />);

    const input = (await screen.findByLabelText(/CARFAX Location ID/)) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe("servicewriter01"));

    // Manual export actions live on the same screen.
    expect(screen.getByRole("button", { name: /Export Today's Data \(PROD\)/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Export All History \(HIST\)/ })).toBeTruthy();

    // The export monitor is rendered on the same screen.
    expect(await screen.findByText("Export History")).toBeTruthy();
    expect(screen.getByText("Total Exports")).toBeTruthy();

    // Enrolled state is shown, not the enrollment call to action.
    expect(screen.getByText("Enrolled & Active")).toBeTruthy();
  });

  it("uses a neutral location ID placeholder — no legacy shop name baked in", async () => {
    fetchSettingsMock.mockResolvedValue(enrolledSettings);
    render(<CarfaxSettings />);

    const input = (await screen.findByLabelText(/CARFAX Location ID/)) as HTMLInputElement;
    expect(input.placeholder).toBe("e.g. yourshop01");
    expect(document.body.textContent).not.toContain("MOBILUBE");
  });

  it("saves a location ID edit through the settings command layer", async () => {
    fetchSettingsMock.mockResolvedValue(enrolledSettings);
    render(<CarfaxSettings />);

    const input = (await screen.findByLabelText(/CARFAX Location ID/)) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe("servicewriter01"));

    fireEvent.change(input, { target: { value: "servicewriter02" } });
    fireEvent.click(screen.getByRole("button", { name: /Save CARFAX Settings/ }));

    await waitFor(() =>
      expect(saveMock).toHaveBeenCalledWith(
        expect.objectContaining({ carfax_location_id: "servicewriter02" })
      )
    );
  });

  it("renders the location form for a shop that has not enrolled yet", async () => {
    fetchSettingsMock.mockResolvedValue(unenrolledSettings);
    render(<CarfaxSettings />);

    const input = (await screen.findByLabelText(/CARFAX Location ID/)) as HTMLInputElement;
    expect(input.value).toBe("");
    expect(screen.getByRole("button", { name: /Join CARFAX Service Network/ })).toBeTruthy();
    expect(await screen.findByText("Export History")).toBeTruthy();
  });
});

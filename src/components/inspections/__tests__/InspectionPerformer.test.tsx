import { render, screen, fireEvent } from "@testing-library/react";
import { InspectionPerformer } from "@/components/inspections/InspectionPerformer";
import {
  fetchInspectionPerformerData,
  fetchInspectionItems,
  saveInspection,
  type InspectionTemplateOption,
  type InspectionItemOption,
} from "@/application/commands/inspection-performer.command";

jest.mock("@/application/commands/inspection-performer.command", () => ({
  saveInspection: jest.fn(),
  fetchInspectionPerformerData: jest.fn(),
  fetchInspectionItems: jest.fn(),
}));

jest.mock("@/components/ui/sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockFetchData = fetchInspectionPerformerData as jest.MockedFunction<typeof fetchInspectionPerformerData>;
const mockFetchItems = fetchInspectionItems as jest.MockedFunction<typeof fetchInspectionItems>;
const mockSave = saveInspection as jest.MockedFunction<typeof saveInspection>;

const TEMPLATE: InspectionTemplateOption = {
  id: "tpl-1",
  name: "MOMS Basic 8-Point Inspection",
  description: null,
  category: "oil_service",
};

const ITEM: InspectionItemOption = {
  id: "item-1",
  template_id: "tpl-1",
  name: "Oil level",
  description: null,
  category: "engine",
  is_required: true,
  sort_order: 0,
};

describe("InspectionPerformer gated flow (gate-required template)", () => {
  it("auto-opens the required template's checklist without the picker detour", async () => {
    mockFetchData.mockResolvedValue({ templates: [TEMPLATE], pastInspections: [] });
    mockFetchItems.mockResolvedValue([ITEM]);
    mockSave.mockResolvedValue(undefined);

    render(
      <InspectionPerformer
        appointmentId="appt-1"
        vehicleId="veh-1"
        requiredTemplateId="tpl-1"
        requiredTemplateName="Full Synthetic Oil Change"
      />,
    );

    // The checklist renders directly: the required template's items and
    // the save action, with no "New Inspection" picker in between.
    expect(await screen.findByText("Oil level")).toBeInTheDocument();
    expect(screen.getByText("MOMS Basic 8-Point Inspection")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save inspection/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /new inspection/i })).not.toBeInTheDocument();
    expect(mockFetchItems).toHaveBeenCalledWith("tpl-1");
  });

  it("shows an inline error with Retry — not an endless spinner — when the load fails", async () => {
    mockFetchData.mockResolvedValue({ templates: [TEMPLATE], pastInspections: [] });
    mockFetchData.mockRejectedValueOnce(new Error("network down"));
    mockFetchItems.mockResolvedValue([ITEM]);

    const { container } = render(
      <InspectionPerformer appointmentId="appt-1" vehicleId="veh-1" requiredTemplateId="tpl-1" />,
    );

    const retry = await screen.findByRole("button", { name: /retry/i });
    expect(screen.getByText("network down")).toBeInTheDocument();
    expect(container.querySelector(".animate-spin")).not.toBeInTheDocument();

    fireEvent.click(retry);
    expect(await screen.findByText("Oil level")).toBeInTheDocument();
  });
});

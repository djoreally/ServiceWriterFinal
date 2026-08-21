import type { Meta, StoryObj } from "@storybook/react";
import { MemoryRouter } from "react-router-dom";
import FleetOSDashboard from "./FleetOSDashboard";
import FleetClients from "./FleetClients";
import FleetWorkOrdersPage from "./FleetWorkOrdersPage";
import FleetReportsPage from "./FleetReportsPage";

const meta: Meta<typeof FleetOSDashboard> = {
  title: "Pages/Fleet OS",
  component: FleetOSDashboard,
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={["/fleet-os"]}>
        <Story />
      </MemoryRouter>
    ),
  ],
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof FleetOSDashboard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Dashboard: Story = {
  render: () => <FleetOSDashboard />,
};

export const Clients: Story = {
  render: () => <FleetClients />,
};

export const WorkOrders: Story = {
  render: () => <FleetWorkOrdersPage />,
};

export const Reports: Story = {
  render: () => <FleetReportsPage />,
};

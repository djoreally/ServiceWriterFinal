import { render, screen } from "@testing-library/react";
import { TireQuantitySelector } from "@/components/booking/TireQuantitySelector";

describe("TireQuantitySelector", () => {
  it("shows a single total quantity control for non-staggered fitment", () => {
    render(
      <TireQuantitySelector
        isStaggered={false}
        onChange={jest.fn()}
      />,
    );

    expect(screen.getByText("How many tires do you need?")).toBeInTheDocument();
    expect(screen.getByLabelText("Total tire quantity")).toBeInTheDocument();
    expect(screen.queryByLabelText("Front tires")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Rear tires")).not.toBeInTheDocument();
  });

  it("shows separate front and rear controls for staggered fitment", () => {
    render(
      <TireQuantitySelector
        isStaggered
        frontQuantity={2}
        rearQuantity={2}
        onChange={jest.fn()}
      />,
    );

    expect(screen.getByLabelText("Front tires")).toBeInTheDocument();
    expect(screen.getByLabelText("Rear tires")).toBeInTheDocument();
    expect(screen.queryByLabelText("Total tire quantity")).not.toBeInTheDocument();
  });
});

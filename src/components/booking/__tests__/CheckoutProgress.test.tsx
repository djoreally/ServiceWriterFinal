import { fireEvent, render, screen } from "@testing-library/react";
import { CheckoutProgress } from "@/components/booking/CheckoutProgress";

describe("CheckoutProgress", () => {
  it("renders all five checkout steps", () => {
    render(<CheckoutProgress currentStep={1} />);
    for (const name of ["Location", "Vehicles", "Services", "Schedule", "Checkout"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it("disables the current step (already there) while past steps stay clickable", () => {
    render(<CheckoutProgress currentStep={3} onStepClick={jest.fn()} />);
    // Current step is not navigable — you are already on it
    expect(screen.getByRole("button", { name: /Services/ })).toBeDisabled();

    // Past steps are clickable; future steps are disabled
    expect(screen.getByRole("button", { name: /Location/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Checkout/ })).toBeDisabled();
  });

  it("navigates to a previously completed step when clicked", () => {
    const onStepClick = jest.fn();
    render(
      <CheckoutProgress currentStep={4} completedSteps={[2]} onStepClick={onStepClick} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Vehicles/ }));
    expect(onStepClick).toHaveBeenCalledWith(2);
  });

  it("does not fire onStepClick for unreachable future steps", () => {
    const onStepClick = jest.fn();
    render(<CheckoutProgress currentStep={2} onStepClick={onStepClick} />);
    fireEvent.click(screen.getByRole("button", { name: /Checkout/ }));
    expect(onStepClick).not.toHaveBeenCalled();
  });

  it("treats explicitly completed steps as navigable even when ahead", () => {
    const onStepClick = jest.fn();
    render(
      <CheckoutProgress currentStep={2} completedSteps={[5]} onStepClick={onStepClick} />,
    );
    const checkout = screen.getByRole("button", { name: /Checkout/ });
    expect(checkout).toBeEnabled();
    fireEvent.click(checkout);
    expect(onStepClick).toHaveBeenCalledWith(5);
  });

  it("works without an onStepClick handler", () => {
    render(<CheckoutProgress currentStep={2} />);
    expect(() =>
      fireEvent.click(screen.getByRole("button", { name: /Location/ })),
    ).not.toThrow();
  });
});

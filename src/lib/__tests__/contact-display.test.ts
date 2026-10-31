import { realCustomerEmail } from "@/lib/contact-display";

// T-15: a placeholder/system email is not a customer email. Pushes for
// customers who gave no email stored the shop's own role inbox on the
// record; rendering it as the customer's address (or a mailto) hides the
// fact that the customer is unreachable.

describe("realCustomerEmail", () => {
  it("passes a real customer email through", () => {
    expect(realCustomerEmail("lbuckman@athenaglobaladvisors.com")).toBe("lbuckman@athenaglobaladvisors.com");
  });

  it("treats the shop's support inbox as a placeholder", () => {
    expect(realCustomerEmail("support@momsoilchange.com")).toBeNull();
  });

  it.each(["info@example.com", "admin@example.com", "noreply@example.com", "contact@example.com"])(
    "treats role inbox %s as a placeholder",
    (email) => {
      expect(realCustomerEmail(email)).toBeNull();
    },
  );

  it.each([null, undefined, "", "   ", "not-an-email"])("treats %p as no email", (email) => {
    expect(realCustomerEmail(email)).toBeNull();
  });

  it("keeps a personal address whose local part merely contains a role word", () => {
    expect(realCustomerEmail("supportive.dad@example.com")).toBe("supportive.dad@example.com");
  });
});

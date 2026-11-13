import { render, waitFor } from "@testing-library/react";
import InvoiceDeepLinkPage from "../../../../app/(app)/invoices/[id]/page";

// Item #9 Step 3 (CHAIR-1): /invoices/<id> is not a page — it redirects to
// the list carrying the id as ?view=<id>, where the Invoices tab opens the
// existing InvoiceDetailDialog. This pins the redirect target shape through
// the real NextRouterAdapter: <Navigate replace> inside the adapter must
// land on nextRouter.replace with exactly "/invoices?view=<id>".

const replaceMock = jest.fn();
const pushMock = jest.fn();
const INVOICE_ID = "7c215cfc-2f4a-4c1e-9f3a-111111111111";

jest.mock("next/navigation", () => ({
  usePathname: () => `/invoices/${INVOICE_ID}`,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  }),
}));

// Auth gating is RequireAuth's own covered behavior; here it is a passthrough
// so the test pins only the redirect.
jest.mock("@/components/routing/legacy-guards", () => ({
  RequireAuth: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("/invoices/[id] deep-link redirect page", () => {
  it("replaces to /invoices?view=<id>", async () => {
    render(<InvoiceDeepLinkPage />);

    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith(`/invoices?view=${INVOICE_ID}`),
    );
    expect(pushMock).not.toHaveBeenCalled();
  });
});

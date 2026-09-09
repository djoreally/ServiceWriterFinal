import type { Metadata } from "next";
import VerticalLandingPage from "@/components/marketing/VerticalLandingPage";

export const metadata: Metadata = {
  title: "Auto Detailing Software | Service Writer",
  description: "Service Writer gives detailing businesses booking, packages, vehicles, photos, technicians, invoices, payments, customer records, and growth workflows in one platform.",
  robots: { index: true, follow: true },
};

export default function DetailersLandingPage() {
  return <VerticalLandingPage
    eyebrow="Service Writer for Detailers"
    title="Your detailing operation deserves more than a calendar and a payment link."
    intro="Service Writer gives mobile detailers, studios, and growing crews one place to manage packages, add-ons, customers, vehicles, photos, appointments, technicians, invoices, payments, and service history."
    proofLine="Detailing is already supported by the same operating system as the rest of Service Writer. The vertical layer focuses the existing platform around the way detailers sell packages, document work, schedule crews, and grow repeat business."
    capabilities={[
      "Detail packages and add-ons",
      "Vehicle-size and service context",
      "Public booking and availability",
      "Customer and vehicle history",
      "Before-and-after photos",
      "Quotes and job pricing",
      "Recurring and repeat-service workflows",
      "Technician and crew assignment",
      "Mobile field workflows",
      "Invoices and payment status",
      "Customer communication",
      "Marketplace-ready provider profiles",
    ]}
    workflow={[
      { title: "Sell the package", copy: "Present services and add-ons through booking while keeping the customer and vehicle attached to the request." },
      { title: "Document the condition", copy: "Keep photos, notes, vehicle details, package selections, and service history with the job instead of across phones and apps." },
      { title: "Run the crew", copy: "Schedule appointments, assign technicians, manage field status, and keep office and mobile work connected as the team grows." },
      { title: "Bring them back", copy: "Close the invoice, preserve the service record, communicate with the customer, and keep the history ready for the next detail." },
    ]}
    growthTitle="Start solo. Build a real detailing company without changing software."
    growthCopy="Basic stays free for the one-person operator. Pro becomes valuable when technicians and dispatch enter the picture. The same platform can support larger crews, multiple service types, commercial work, and future fleet opportunities without forcing a move to a different system."
  />;
}

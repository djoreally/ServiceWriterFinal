import type { Metadata } from "next";
import VerticalLandingPage from "@/components/marketing/VerticalLandingPage";

export const metadata: Metadata = {
  title: "Tire Shop & Mobile Tire Software | Service Writer",
  description: "Service Writer gives tire businesses booking, vehicles, service packages, tire workflows, photos, technicians, invoices, payments, fleet operations, and customer records in one platform.",
  robots: { index: true, follow: true },
};

export default function TireLandingPage() {
  return <VerticalLandingPage
    eyebrow="Service Writer for Tire Businesses"
    title="Run the tire business. Not another disconnected app."
    intro="Service Writer gives mobile tire operators, independent tire shops, and growing service teams one place to manage customers, vehicles, tire services, appointments, photos, technicians, invoices, payments, and fleet work."
    proofLine="The tire workflow is not a future product line. The platform already contains the operating records and workflows tire businesses need; this vertical experience puts those capabilities front and center."
    capabilities={[
      "Vehicle and VIN records",
      "Tire quantity and service packaging",
      "Pricing and job quoting",
      "Booking and availability",
      "Mobile and shop scheduling",
      "Photos and service records",
      "Technician assignment and field workflows",
      "Invoices and payment status",
      "Customer communication and history",
      "Fleet accounts and recurring work",
      "Inventory and service context",
      "Marketplace-ready provider profiles",
    ]}
    workflow={[
      { title: "Capture the vehicle", copy: "Keep the customer, vehicle, VIN, tire request, notes, and service context attached to the job." },
      { title: "Price the work", copy: "Build the service, quantity, pricing, add-ons, quote, and appointment without rebuilding customer context." },
      { title: "Schedule the install", copy: "Use availability, location, technician assignment, and field workflows for mobile or shop-based tire work." },
      { title: "Close the record", copy: "Store photos and service history, issue the invoice, record payment, and keep the relationship ready for the next set." },
    ]}
    growthTitle="Built for the tire operator who plans to get bigger."
    growthCopy="A one-person tire business can start on Basic for free. When the operation hires technicians, Pro adds Technician OS and dispatch. When commercial and fleet accounts become a serious part of the business, Fleet adds the full fleet operating layer without forcing a platform migration."
  />;
}

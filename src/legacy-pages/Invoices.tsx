import { AppLayout } from "@/components/layout/AppLayout";
import { InvoicesTab } from "@/legacy-pages/financials/Invoices";

const InvoicesPage = () => {
  return (
    <AppLayout title="Invoices">
      <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto w-full">
        <InvoicesTab />
      </div>
    </AppLayout>
  );
};

export default InvoicesPage;

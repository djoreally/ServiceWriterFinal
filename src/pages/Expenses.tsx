import { AppLayout } from "@/components/layout/AppLayout";
import { ExpensesTab } from "@/pages/financials/Expenses";

const ExpensesPage = () => {
  return (
    <AppLayout title="Expenses">
      <div className="p-4 md:p-6 space-y-6">
        <ExpensesTab />
      </div>
    </AppLayout>
  );
};

export default ExpensesPage;

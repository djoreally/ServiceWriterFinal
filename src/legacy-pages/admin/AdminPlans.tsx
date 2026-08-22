import { AppLayout } from "@/components/layout/AppLayout";
import { AdminPlatformPlans } from "@/components/admin/AdminPlatformPlans";

const AdminPlans = () => {
  return (
    <AppLayout>
      <div className="container mx-auto py-6">
        <AdminPlatformPlans />
      </div>
    </AppLayout>
  );
};

export default AdminPlans;

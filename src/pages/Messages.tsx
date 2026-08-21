import { AppLayout } from "@/components/layout/AppLayout";
import { InternalInbox } from "@/components/communications/InternalInbox";
import { useSearchParams } from "react-router-dom";

const MessagesPage = () => {
  const [params] = useSearchParams();
  const initialAppointmentId = params.get("appointmentId") || undefined;

  return (
    <AppLayout title="Team Messages">
      <InternalInbox initialAppointmentId={initialAppointmentId} />
    </AppLayout>
  );
};

export default MessagesPage;

import { useState } from "react";
import { Link } from "react-router-dom";
import { MonitorSmartphone } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AppLayout } from "@/components/layout/AppLayout";
import { supabase } from "@/integrations/supabase/client";

export default function SessionManagement() {
  const [loading, setLoading] = useState(false);

  const revokeOthers = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signOut({ scope: "others" });
    if (error) {
      toast.error("Unable to revoke other sessions.");
    } else {
      await supabase.rpc("record_auth_security_event_v1", {
        p_event_type: "session_revoked_others",
        p_metadata: { source: "session_management" },
      });
      toast.success("Other sessions have been revoked.");
    }
    setLoading(false);
  };

  return (
    <AppLayout title="Session Management">
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <MonitorSmartphone className="mb-2 h-8 w-8 text-primary" />
            <CardTitle>Session management</CardTitle>
            <CardDescription>
              Your current browser session remains active. Revoke every other active session if you no longer recognize a device.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="destructive" disabled={loading} onClick={() => void revokeOthers()}>
              {loading ? "Revoking…" : "Sign out other sessions"}
            </Button>
            <p className="text-sm text-muted-foreground">
              If you need help recovering account access, contact a workspace administrator.
            </p>
            <Link className="block text-sm text-primary hover:underline" to="/settings">Back to settings</Link>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

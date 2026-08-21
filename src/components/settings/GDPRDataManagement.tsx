import { SUPABASE_URL_RESOLVED } from "@/integrations/supabase/client";
/**
 * GDPR Data Management Component
 * Sprint 3 Story 3.2.1 - Data Export UI
 * 
 * Provides users with GDPR self-service tools:
 * - Export My Data (Article 15 - Right to Access)
 * - Delete My Account (Article 17 - Right to Erasure) - Coming soon
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download, Loader2, Shield, Trash2, AlertTriangle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { getCurrentSession, signOutCurrentUser } from "@/application/commands/gdpr.command";
import { useNavigate } from "react-router-dom";

export function GDPRDataManagement() {
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const navigate = useNavigate();

  const handleExportData = async () => {
    try {
      setExporting(true);
      toast.info("Preparing your data export...");

      // Get the current session
      const { data: { session } } = await getCurrentSession();
      
      if (!session) {
        toast.error("You must be logged in to export data");
        return;
      }

      // Call the GDPR data export edge function
      const response = await fetch(
        `${SUPABASE_URL_RESOLVED}/functions/v1/gdpr-data-export`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to export data");
      }

      // Get the JSON data
      const data = await response.json();
      
      // Create a Blob and download it
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `data-export-${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success("Your data has been exported successfully");
    } catch (error) {
      console.error("Export error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to export data");
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (confirmationText !== "DELETE_MY_ACCOUNT") {
      toast.error('Please type "DELETE_MY_ACCOUNT" to confirm');
      return;
    }

    try {
      setDeleting(true);
      toast.info("Processing account deletion...");

      // Get the current session
      const { data: { session } } = await getCurrentSession();
      
      if (!session) {
        toast.error("You must be logged in to delete your account");
        return;
      }

      // Call the GDPR account deletion edge function
      const response = await fetch(
        `${SUPABASE_URL_RESOLVED}/functions/v1/gdpr-account-deletion`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ confirmationText }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to delete account");
      }

      // Success - account has been deleted
      toast.success("Your account has been deleted. Logging out...");
      
      // Close modal
      setShowDeleteModal(false);
      
      // Wait a moment then sign out and redirect
      setTimeout(async () => {
        await signOutCurrentUser();
        navigate("/");
      }, 2000);

    } catch (error) {
      console.error("Delete error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to delete account");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card className="border-blue-200 dark:border-blue-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
          <Shield className="h-5 w-5" />
          GDPR Data Management
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Manage your personal data and exercise your GDPR rights
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Data Export Section */}
        <div className="space-y-3">
          <div>
            <h3 className="font-semibold text-sm mb-1">Export Your Data</h3>
            <p className="text-xs text-muted-foreground">
              Download a comprehensive JSON file containing all your data stored in Service Writer.
              This includes customers, appointments, vehicles, payments, and more.
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              onClick={handleExportData}
              disabled={exporting}
              className="gap-2"
              variant="outline"
            >
              {exporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Export My Data
                </>
              )}
            </Button>
            
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Shield className="h-3 w-3" />
              <span>GDPR Article 15 - Right to Access</span>
            </div>
          </div>

          <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded-md text-xs space-y-1">
            <p className="font-medium text-blue-900 dark:text-blue-100">What's included:</p>
            <ul className="list-disc list-inside space-y-0.5 text-blue-800 dark:text-blue-200">
              <li>Business profile and settings</li>
              <li>Customers and vehicles</li>
              <li>Appointments and service records</li>
              <li>Payment history and invoices</li>
              <li>Team members and technicians</li>
              <li>All other data associated with your account</li>
            </ul>
          </div>
        </div>

        {/* Account Deletion Section */}
        <div className="space-y-3 pt-6 border-t">
          <div>
            <h3 className="font-semibold text-sm mb-1 text-red-600 dark:text-red-400">
              Delete My Account
            </h3>
            <p className="text-xs text-muted-foreground">
              Permanently delete your account and all associated data. This action cannot be undone,
              and there will be a 30-day grace period before final deletion.
            </p>
          </div>
          
          <Button
            onClick={() => setShowDeleteModal(true)}
            disabled={deleting}
            variant="destructive"
            className="gap-2"
          >
            <Trash2 className="h-4 w-4" />
            Delete My Account
          </Button>

          <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/30 p-3 rounded-md text-xs border border-red-200 dark:border-red-900">
            <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-red-900 dark:text-red-100">
                Warning: This action is permanent
              </p>
              <ul className="text-red-800 dark:text-red-200 mt-1 space-y-0.5 list-disc list-inside">
                <li>All your data will be immediately soft-deleted</li>
                <li>You will be logged out and cannot log back in</li>
                <li>After 30 days, all data will be permanently deleted</li>
                <li>This action cannot be undone</li>
              </ul>
              <p className="text-red-800 dark:text-red-200 mt-2">
                <Shield className="h-3 w-3 inline mr-1" />
                <span className="font-medium">GDPR Article 17 - Right to Erasure</span>
              </p>
            </div>
          </div>
        </div>

        {/* Delete Account Confirmation Modal */}
        <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-5 w-5" />
                Delete Account Confirmation
              </DialogTitle>
              <DialogDescription className="space-y-3 pt-3">
                <p className="font-medium text-foreground">
                  Are you absolutely sure you want to delete your account?
                </p>
                
                <div className="bg-red-50 dark:bg-red-950/30 p-3 rounded-md text-sm space-y-2 border border-red-200 dark:border-red-900">
                  <p className="font-semibold text-red-900 dark:text-red-100">
                    This will immediately:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-red-800 dark:text-red-200 text-xs">
                    <li>Soft delete all your business data (customers, appointments, etc.)</li>
                    <li>Delete your authentication account (you cannot log in)</li>
                    <li>Schedule permanent deletion in 30 days</li>
                  </ul>
                </div>

                <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded-md text-sm border border-blue-200 dark:border-blue-900">
                  <p className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
                    30-Day Grace Period:
                  </p>
                  <p className="text-blue-800 dark:text-blue-200 text-xs">
                    Your data will be soft-deleted immediately but kept for 30 days before
                    permanent deletion. During this time, data is inaccessible but can be
                    recovered by contacting support if needed.
                  </p>
                </div>

                <div className="space-y-2 pt-2">
                  <Label htmlFor="confirmation" className="text-sm font-medium">
                    Type <span className="font-mono font-bold">DELETE_MY_ACCOUNT</span> to confirm:
                  </Label>
                  <Input
                    id="confirmation"
                    value={confirmationText}
                    onChange={(e) => setConfirmationText(e.target.value)}
                    placeholder="DELETE_MY_ACCOUNT"
                    className="font-mono"
                    disabled={deleting}
                  />
                </div>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowDeleteModal(false);
                  setConfirmationText("");
                }}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDeleteAccount}
                disabled={confirmationText !== "DELETE_MY_ACCOUNT" || deleting}
                className="gap-2"
              >
                {deleting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Delete My Account
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Privacy Policy Link */}
        <div className="pt-6 border-t">
          <div className="text-xs text-muted-foreground">
            <p>
              Learn more about how we handle your data in our{" "}
              <a href="/privacy-policy" className="text-blue-600 hover:underline">
                Privacy Policy
              </a>
              {" "}and{" "}
              <a 
                href="https://github.com/djoreally/moms-ab72d60a/blob/main/docs/compliance/DATA_RETENTION_POLICY.md" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                Data Retention Policy
              </a>
              .
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

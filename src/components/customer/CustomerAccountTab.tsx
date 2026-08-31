import { errorMessage } from "@/lib/error-message";
import { useState } from "react";
import { updateCustomerAccountProfile, changeCustomerPassword, type CustomerAccountProfile } from "@/application/commands/customer-account.command";
import { toast } from "@/components/ui/sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  User,
  Mail,
  Phone,
  Save,
  Shield,
  KeyRound,
} from "lucide-react";
import { format, parseISO } from "date-fns";

interface Props {
  account: CustomerAccountProfile;
  onUpdate: (updated: CustomerAccountProfile) => void;
}

export function CustomerAccountTab({ account, onUpdate }: Props) {
  const [fullName, setFullName] = useState(account.full_name || "");
  const [phone, setPhone] = useState(account.phone || "");
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const hasChanges =
    fullName !== (account.full_name || "") ||
    phone !== (account.phone || "");

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const updated = await updateCustomerAccountProfile(account.id, {
        full_name: fullName.trim() || null,
        phone: phone.trim() || null,
      });
      toast.success("Profile updated successfully");
      onUpdate(updated);
    } catch {
      toast.error("Failed to update profile");
    }
    setSaving(false);
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setChangingPassword(true);
    try {
      await changeCustomerPassword(newPassword);
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Failed to change password"));
      setChangingPassword(false);
      return;
    }
    setChangingPassword(false);

    toast.success("Password changed successfully");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Profile Information */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Profile Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName" className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              Full Name
            </Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              Email Address
            </Label>
            <Input
              id="email"
              value={account.email}
              disabled
              className="opacity-70"
            />
            <p className="text-xs text-muted-foreground">
              Email address cannot be changed from the dashboard
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone" className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              Phone Number
            </Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 123-4567"
              type="tel"
            />
          </div>

          <Button
            onClick={handleSaveProfile}
            disabled={saving || !hasChanges}
            className="w-full sm:w-auto"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
        </CardContent>
      </Card>

      {/* Change Password */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Change Password
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="newPassword" className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              New Password
            </Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
            />
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="confirmPassword"
              className="flex items-center gap-2"
            >
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              Confirm New Password
            </Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
            />
          </div>

          <Button
            onClick={handleChangePassword}
            disabled={changingPassword || !newPassword || !confirmPassword}
            variant="outline"
            className="w-full sm:w-auto"
          >
            {changingPassword ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Shield className="h-4 w-4 mr-2" />
            )}
            Change Password
          </Button>
        </CardContent>
      </Card>

      {/* Account Info (read-only) */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">
            Account Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Account ID</dt>
              <dd className="font-mono text-xs mt-1">
                {account.id.slice(0, 8)}...
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Provider</dt>
              <dd className="mt-1">
                {account.provider_id ? "Linked" : "Email / Password"}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * EmailSettings - White-label email configuration with optional custom SMTP
 */

import { useState, useEffect } from "react";
import {
  fetchEmailSettings as fetchEmailSettingsData,
} from "@/application/queries/email-settings.query";
import {
  saveEmailSettings as saveEmailSettingsData,
  encryptSmtpPassword,
  encryptEmailPassword,
  invokeTestEmail,
  invokeTestIncomingEmail,
} from "@/application/commands/email-settings.command";
import { getCurrentUserId } from "@/application/queries/email-auth.query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Mail, Server, Save, Loader2, TestTube, CheckCircle2, AlertTriangle, Eye, EyeOff } from "lucide-react";
import { toast } from "@/components/ui/sonner";

interface EmailSettingsData {
  from_name: string;
  from_email: string;
  reply_to_email: string;
  use_custom_smtp: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_password: string; // Not encrypted on client side
  imap_enabled: boolean;
  imap_host: string;
  imap_port: number;
  imap_username: string;
  imap_password: string;
  imap_secure: boolean;
}

export const EmailSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [hasStoredPassword, setHasStoredPassword] = useState(false);
  const [hasStoredImapPassword, setHasStoredImapPassword] = useState(false);
  const [settings, setSettings] = useState<EmailSettingsData>({
    from_name: "",
    from_email: "",
    reply_to_email: "",
    use_custom_smtp: false,
    smtp_host: "",
    smtp_port: 587,
    smtp_username: "",
    smtp_password: "",
    imap_enabled: false,
    imap_host: "",
    imap_port: 993,
    imap_username: "",
    imap_password: "",
    imap_secure: true,
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    const data = await fetchEmailSettingsData();

    if (data) {
      setHasStoredPassword(!!data.smtp_password_encrypted);
      setHasStoredImapPassword(!!data.imap_password_encrypted);
      setSettings({
        from_name: data.from_name || "",
        from_email: data.from_email || "",
        reply_to_email: data.reply_to_email || "",
        use_custom_smtp: data.use_custom_smtp || false,
        smtp_host: data.smtp_host || "",
        smtp_port: data.smtp_port || 587,
        smtp_username: data.smtp_username || "",
        smtp_password: "",
        imap_enabled: data.imap_enabled || false,
        imap_host: data.imap_host || "",
        imap_port: data.imap_port || 993,
        imap_username: data.imap_username || "",
        imap_password: "",
        imap_secure: data.imap_secure ?? true,
      });
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setTestResult(null);
    
    const userId = await getCurrentUserId();
    if (!userId) {
      toast.error("Not authenticated");
      setSaving(false);
      return;
    }

    // Validate email format if provided
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (settings.from_email && !emailRegex.test(settings.from_email)) {
      toast.error("Invalid From Email format");
      setSaving(false);
      return;
    }
    if (settings.reply_to_email && !emailRegex.test(settings.reply_to_email)) {
      toast.error("Invalid Reply-To Email format");
      setSaving(false);
      return;
    }

    if (settings.use_custom_smtp) {
      if (!settings.smtp_host) {
        toast.error("SMTP Host is required when using custom SMTP");
        setSaving(false);
        return;
      }
      if (!settings.smtp_username) {
        toast.error("SMTP Username is required");
        setSaving(false);
        return;
      }
      if (!settings.smtp_password && !hasStoredPassword) {
        toast.error("SMTP password is required");
        setSaving(false);
        return;
      }
    }
    if (settings.imap_enabled && (!settings.imap_host || !settings.imap_username || (!settings.imap_password && !hasStoredImapPassword))) {
      toast.error("IMAP host, username, and password are required for the Fleet OS inbox");
      setSaving(false);
      return;
    }

    try {
      const payload: Record<string, unknown> = {
        from_name: settings.from_name || null,
        from_email: settings.from_email || null,
        reply_to_email: settings.reply_to_email || null,
        use_custom_smtp: settings.use_custom_smtp,
        smtp_host: settings.use_custom_smtp ? settings.smtp_host : null,
        smtp_port: settings.use_custom_smtp ? settings.smtp_port : null,
        smtp_username: settings.use_custom_smtp ? settings.smtp_username : null,
        imap_enabled: settings.imap_enabled,
        imap_host: settings.imap_enabled ? settings.imap_host : null,
        imap_port: settings.imap_enabled ? settings.imap_port : 993,
        imap_username: settings.imap_enabled ? settings.imap_username : null,
        imap_secure: settings.imap_secure,
      };

      if (settings.smtp_password && settings.use_custom_smtp) {
        const { data: encryptedPassword, error: encryptError } = await encryptSmtpPassword(settings.smtp_password);
        if (encryptError) {
          console.error("Encryption error:", encryptError);
          toast.error("Failed to encrypt SMTP password");
          setSaving(false);
          return;
        }
        payload.smtp_password_encrypted = encryptedPassword;
      } else if (!settings.use_custom_smtp) {
        payload.smtp_password_encrypted = null;
      }

      if (settings.imap_password && settings.imap_enabled) {
        const { data: encryptedPassword, error: encryptError } = await encryptEmailPassword(settings.imap_password);
        if (encryptError) throw encryptError;
        payload.imap_password_encrypted = encryptedPassword;
      } else if (!settings.imap_enabled) {
        payload.imap_password_encrypted = null;
      }

      const { error } = await saveEmailSettingsData(payload);

      if (error) {
        console.error("Save error:", error);
        toast.error("Failed to save email settings");
      } else {
        toast.success("Email settings saved!");
        if (settings.smtp_password) setHasStoredPassword(true);
        if (settings.imap_password) setHasStoredImapPassword(true);
        setSettings(prev => ({ ...prev, smtp_password: "", imap_password: "" }));
      }
    } catch (err) {
      console.error("Save error:", err);
      toast.error("Failed to save email settings");
    }
    
    setSaving(false);
  };

  const handleTestEmail = async () => {
    setTesting(true);
    setTestResult(null);

    const userId = await getCurrentUserId();
    if (!userId) {
      toast.error("Not authenticated");
      setTesting(false);
      return;
    }

    try {
      const { data, error } = await invokeTestEmail(userId);

        if (error) {
          setTestResult({ success: false, message: error.message || "Test failed" });
        } else if (data?.success) {
          setTestResult({ success: true, message: data?.message || "Test email sent successfully!" });
        } else {
          setTestResult({ success: false, message: data?.error || "Test failed" });
        }
    } catch (err) {
      setTestResult({ success: false, message: "Failed to send test email" });
    }

    setTesting(false);
  };

  const handleTestIncoming = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await invokeTestIncomingEmail();
      setTestResult(error || !data?.success
        ? { success: false, message: data?.error || error?.message || "IMAP connection failed" }
        : { success: true, message: data.message || "Incoming mailbox connected" });
    } catch (error) {
      setTestResult({ success: false, message: error instanceof Error ? error.message : "IMAP connection failed" });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card id="email-settings" className="scroll-mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Email Settings
        </CardTitle>
        <CardDescription>
          This is the single connection used by Fleet OS Email: SMTP sends replies and IMAP receives inbox messages.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Sender Information */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium">Sender Information</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="from_name">From Name</Label>
              <Input
                id="from_name"
                placeholder="Your Business Name"
                value={settings.from_name}
                onChange={(e) => setSettings(prev => ({ ...prev, from_name: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Name shown in email "From" field</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="from_email">From Email</Label>
              <Input
                id="from_email"
                type="email"
                placeholder="noreply@yourdomain.com"
                value={settings.from_email}
                onChange={(e) => setSettings(prev => ({ ...prev, from_email: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                {settings.use_custom_smtp 
                  ? "Must match your SMTP domain" 
                  : "Requires DNS verification for custom domains"
                }
              </p>
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="reply_to_email">Reply-To Email</Label>
              <Input
                id="reply_to_email"
                type="email"
                placeholder="support@yourbusiness.com"
                value={settings.reply_to_email}
                onChange={(e) => setSettings(prev => ({ ...prev, reply_to_email: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Where customers' replies go</p>
            </div>
          </div>
        </div>

        {/* Custom SMTP Toggle */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4" />
              <Label htmlFor="use_custom_smtp" className="font-medium">Use Custom SMTP</Label>
            </div>
            <p className="text-sm text-muted-foreground">
              Send emails through your own mail server for full white-label control
            </p>
          </div>
          <Switch
            id="use_custom_smtp"
            checked={settings.use_custom_smtp}
            onCheckedChange={(checked) => setSettings(prev => ({ ...prev, use_custom_smtp: checked }))}
          />
        </div>

        {/* SMTP Configuration */}
        {settings.use_custom_smtp && (
          <div className="space-y-4 rounded-lg border p-4">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Server className="h-4 w-4" />
              SMTP Configuration
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="smtp_host">SMTP Host</Label>
                <Input
                  id="smtp_host"
                  placeholder="smtp.yourdomain.com"
                  value={settings.smtp_host}
                  onChange={(e) => setSettings(prev => ({ ...prev, smtp_host: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="smtp_port">SMTP Port</Label>
                <Input
                  id="smtp_port"
                  type="number"
                  placeholder="587"
                  value={settings.smtp_port}
                  onChange={(e) => setSettings(prev => ({ ...prev, smtp_port: parseInt(e.target.value) || 587 }))}
                />
                <p className="text-xs text-muted-foreground">Common: 587 (TLS), 465 (SSL), 25</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="smtp_username">SMTP Username</Label>
                <Input
                  id="smtp_username"
                  placeholder="username@yourdomain.com"
                  value={settings.smtp_username}
                  onChange={(e) => setSettings(prev => ({ ...prev, smtp_username: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="smtp_password">SMTP Password</Label>
                {hasStoredPassword && !settings.smtp_password && (
                  <p className="text-xs text-primary flex items-center gap-1">
                    ✓ Password saved securely. Leave blank to keep current password.
                  </p>
                )}
                <div className="relative">
                  <Input
                    id="smtp_password"
                    type={showPassword ? "text" : "password"}
                    placeholder={hasStoredPassword ? "Leave blank to keep current" : "Enter SMTP password"}
                    value={settings.smtp_password}
                    onChange={(e) => setSettings(prev => ({ ...prev, smtp_password: e.target.value }))}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Leave blank to keep existing password</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="imap_enabled" className="font-medium">Enable two-way inbox (IMAP)</Label>
            <p className="text-sm text-muted-foreground">Receive customer replies in Fleet OS. SMTP alone cannot receive email.</p>
          </div>
          <Switch id="imap_enabled" checked={settings.imap_enabled} onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, imap_enabled: checked }))} />
        </div>

        {settings.imap_enabled && (
          <div className="space-y-4 rounded-lg border p-4">
            <h3 className="flex items-center gap-2 text-sm font-medium"><Mail className="h-4 w-4" />Incoming Mail (IMAP)</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2"><Label htmlFor="imap_host">IMAP Host</Label><Input id="imap_host" placeholder="imap.yourdomain.com" value={settings.imap_host} onChange={(e) => setSettings((prev) => ({ ...prev, imap_host: e.target.value }))} /></div>
              <div className="grid gap-2"><Label htmlFor="imap_port">IMAP Port</Label><Input id="imap_port" type="number" value={settings.imap_port} onChange={(e) => setSettings((prev) => ({ ...prev, imap_port: Number(e.target.value) || 993 }))} /></div>
              <div className="grid gap-2"><Label htmlFor="imap_username">IMAP Username</Label><Input id="imap_username" value={settings.imap_username} onChange={(e) => setSettings((prev) => ({ ...prev, imap_username: e.target.value }))} /></div>
              <div className="grid gap-2">
                <Label htmlFor="imap_password">IMAP Password</Label>
                {hasStoredImapPassword && !settings.imap_password && <p className="text-xs text-primary">✓ Password saved. Leave blank to keep it.</p>}
                <Input id="imap_password" type="password" placeholder={hasStoredImapPassword ? "Leave blank to keep current" : "App password"} value={settings.imap_password} onChange={(e) => setSettings((prev) => ({ ...prev, imap_password: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center justify-between"><div><Label htmlFor="imap_secure">Use TLS</Label><p className="text-xs text-muted-foreground">Recommended; normally port 993</p></div><Switch id="imap_secure" checked={settings.imap_secure} onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, imap_secure: checked }))} /></div>
          </div>
        )}

        {/* Test Result Alert */}
        {testResult && (
          <Alert variant={testResult.success ? "default" : "destructive"}>
            {testResult.success ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            <AlertDescription>{testResult.message}</AlertDescription>
          </Alert>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Email Settings
          </Button>
          <Button variant="outline" onClick={handleTestEmail} disabled={testing || saving}>
            {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TestTube className="mr-2 h-4 w-4" />}
            Send Test Email
          </Button>
          {settings.imap_enabled && <Button variant="outline" onClick={handleTestIncoming} disabled={testing || saving}><TestTube className="mr-2 h-4 w-4" />Test Incoming Mail</Button>}
        </div>

        {/* Info Note */}
        <p className="text-xs text-muted-foreground">
          {settings.use_custom_smtp 
            ? "Test sends try your SMTP server first and automatically fall back to the platform sender if SMTP authentication fails."
            : "Emails are sent via our platform service (noreply@servicewriter.xyz). Custom sender names work, but custom domains require DNS verification."
          }
        </p>
      </CardContent>
    </Card>
  );
};

/**
 * QuickBooksSettings - QuickBooks Online Integration
 * 
 * Allows businesses to connect their QuickBooks Online account
 * for syncing customers and invoices.
 */

import { useState, useEffect } from "react";
import {
  fetchQBOData,
} from "@/application/queries/quickbooks.query";
import {
  saveQBOSettings,
  invokeQBOConnect,
  invokeQBODisconnect,
  invokeQBOSync,
} from "@/application/commands/quickbooks.command";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  BookOpen,
  Link,
  Unlink,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Users,
  FileText,
  CreditCard,
  Loader2,
  ExternalLink,
  Clock,
  ArrowRightLeft,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { format, formatDistanceToNow } from "date-fns";

interface QBOSettings {
  qbo_enabled: boolean;
  qbo_realm_id: string | null;
  qbo_connected_at: string | null;
  qbo_sync_customers: boolean;
  qbo_sync_invoices: boolean;
  qbo_sync_payments: boolean;
  qbo_income_account_id: string | null;
  qbo_last_sync_at: string | null;
}

interface SyncLog {
  id: string;
  sync_type: string;
  entity_type: string | null;
  direction: string;
  status: string;
  records_synced: number;
  records_failed: number;
  error_details: Record<string, unknown> | null;
  started_at: string;
  completed_at: string | null;
}

interface EntityMappingStats {
  customers: number;
  invoices: number;
  payments: number;
}

export const QuickBooksSettings = () => {
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);
  
  const [settings, setSettings] = useState<QBOSettings>({
    qbo_enabled: false,
    qbo_realm_id: null,
    qbo_connected_at: null,
    qbo_sync_customers: true,
    qbo_sync_invoices: true,
    qbo_sync_payments: false,
    qbo_income_account_id: null,
    qbo_last_sync_at: null,
  });
  
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [entityStats, setEntityStats] = useState<EntityMappingStats>({
    customers: 0,
    invoices: 0,
    payments: 0,
  });

  useEffect(() => {
    fetchData();
    
    // Check for OAuth callback
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get("qbo_success") === "true") {
        toast.success("QuickBooks connected successfully!");
        window.history.replaceState({}, "", window.location.pathname);
        fetchData();
      } else if (params.get("qbo_error")) {
        toast.error(`QuickBooks connection failed: ${params.get("qbo_error")}`);
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
  }, []);

  const fetchData = async () => {
    const result = await fetchQBOData();
    if (!result) { setLoading(false); return; }

    if (result.profile) {
      setSettings({
        qbo_enabled: result.profile.qbo_enabled ?? false,
        qbo_realm_id: result.profile.qbo_realm_id,
        qbo_connected_at: result.profile.qbo_connected_at,
        qbo_sync_customers: result.profile.qbo_sync_customers ?? true,
        qbo_sync_invoices: result.profile.qbo_sync_invoices ?? true,
        qbo_sync_payments: result.profile.qbo_sync_payments ?? false,
        qbo_income_account_id: result.profile.qbo_income_account_id,
        qbo_last_sync_at: result.profile.qbo_last_sync_at,
      });
    }

    setSyncLogs(result.syncLogs as any);
    setEntityStats(result.entityStats);
    setLoading(false);
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const response = await invokeQBOConnect();
      if (response.error) throw new Error(response.error.message || "Failed to start connection");
      if (response.data?.authUrl) {
        window.location.href = response.data.authUrl;
      } else {
        throw new Error("No authorization URL received");
      }
    } catch (error) {
      console.error("Error connecting to QuickBooks:", error);
      toast.error(error instanceof Error ? error.message : "Failed to connect to QuickBooks");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const response = await invokeQBODisconnect();
      if (response.error) throw new Error(response.error.message || "Failed to disconnect");
      toast.success("QuickBooks disconnected");
      fetchData();
    } catch (error) {
      console.error("Error disconnecting QuickBooks:", error);
      toast.error(error instanceof Error ? error.message : "Failed to disconnect");
    } finally {
      setDisconnecting(false);
      setDisconnectDialogOpen(false);
    }
  };

  const handleSync = async (entityType?: string) => {
    setSyncing(true);
    try {
      const response = await invokeQBOSync(entityType);
      if (response.error) throw new Error(response.error.message || "Sync failed");
      toast.success(response.data?.message || "Sync completed");
      fetchData();
    } catch (error) {
      console.error("Error syncing:", error);
      toast.error(error instanceof Error ? error.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    const { error } = await saveQBOSettings({
      qbo_sync_customers: settings.qbo_sync_customers,
      qbo_sync_invoices: settings.qbo_sync_invoices,
      qbo_sync_payments: false,
      qbo_income_account_id: settings.qbo_income_account_id,
    });

    if (error) {
      toast.error("Failed to save settings");
    } else {
      toast.success("Settings saved");
    }
    setSaving(false);
  };

  const getSyncStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400">Completed</Badge>;
      case "started":
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">In Progress</Badge>;
      case "partial":
        return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">Partial</Badge>;
      case "failed":
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">Failed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const isConnected = !!settings.qbo_realm_id;

  return (
    <div className="space-y-6">
      {/* Connection Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            QuickBooks Online Integration
          </CardTitle>
          <CardDescription>
            Connect your QuickBooks Online account to sync customers and invoices
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!isConnected ? (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <p className="text-sm font-medium">Connect to QuickBooks to:</p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Automatically sync customers to QuickBooks</li>
                  <li>Create invoices in QuickBooks from completed services</li>
                  <li>Payment sync is currently unavailable in this integration</li>
                </ul>
              </div>
              <Button onClick={handleConnect} disabled={connecting} className="gap-2">
                {connecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Link className="h-4 w-4" />
                )}
                Connect QuickBooks Online
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Connection Status */}
              <div className="bg-green-50 dark:bg-green-950/30 border border-gray-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-gray-600 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-800 dark:text-green-200">
                          Connected to QuickBooks
                        </p>
                        <p className="text-sm text-gray-700 dark:text-green-300">
                          Company ID: {settings.qbo_realm_id}
                        </p>
                        {settings.qbo_connected_at && (
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            Connected {formatDistanceToNow(new Date(settings.qbo_connected_at))} ago
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDisconnectDialogOpen(true)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Unlink className="h-4 w-4 mr-2" />
                        Disconnect
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Synced Entities Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-muted/50 rounded-lg p-4 text-center">
                  <Users className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-2xl font-bold">{entityStats.customers}</p>
                  <p className="text-xs text-muted-foreground">Customers Synced</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-4 text-center">
                  <FileText className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-2xl font-bold">{entityStats.invoices}</p>
                  <p className="text-xs text-muted-foreground">Invoices Synced</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-4 text-center">
                  <CreditCard className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-2xl font-bold">{entityStats.payments}</p>
                  <p className="text-xs text-muted-foreground">Payments Synced (Unavailable)</p>
                </div>
              </div>

              {/* Sync Actions */}
              <div className="flex items-center justify-between">
                <div>
                  {settings.qbo_last_sync_at && (
                    <p className="text-sm text-muted-foreground">
                      Last sync: {formatDistanceToNow(new Date(settings.qbo_last_sync_at))} ago
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  onClick={() => handleSync()}
                  disabled={syncing}
                  className="gap-2"
                >
                  {syncing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Sync Now
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sync Settings - Only show when connected */}
      {isConnected && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" />
              Sync Settings
            </CardTitle>
            <CardDescription>
              Configure what data to sync between your shop and QuickBooks
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <Label>Sync Customers</Label>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Create customers in QuickBooks when added here
                  </p>
                </div>
                <Switch
                  checked={settings.qbo_sync_customers}
                  onCheckedChange={(checked) =>
                    setSettings({ ...settings, qbo_sync_customers: checked })
                  }
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <Label>Sync Invoices</Label>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Create invoices in QuickBooks for completed services
                  </p>
                </div>
                <Switch
                  checked={settings.qbo_sync_invoices}
                  onCheckedChange={(checked) =>
                    setSettings({ ...settings, qbo_sync_invoices: checked })
                  }
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                    <Label>Sync Payments</Label>
                    <Badge variant="secondary">Unavailable</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Payment sync is not yet supported by the current QuickBooks sync worker
                  </p>
                </div>
                <Switch
                  checked={false}
                  disabled
                  onCheckedChange={() => {
                    // Intentionally disabled until payment sync is implemented.
                  }}
                />
              </div>
            </div>

            <Button onClick={handleSaveSettings} disabled={saving} className="w-full">
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Save Sync Settings
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Sync History - Only show when connected */}
      {isConnected && syncLogs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Sync History
            </CardTitle>
            <CardDescription>
              Recent synchronization activity
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Records</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {syncLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm">
                      {format(new Date(log.started_at), "MMM d, h:mm a")}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {log.entity_type || "all"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {log.direction}
                    </TableCell>
                    <TableCell>
                      {getSyncStatusBadge(log.status)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      <span className="text-gray-600">{log.records_synced}</span>
                      {log.records_failed > 0 && (
                        <span className="text-red-600 ml-2">
                          ({log.records_failed} failed)
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Info Card */}
      <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                QuickBooks Online Required
              </p>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                This integration requires an active QuickBooks Online subscription. 
                QuickBooks Desktop is not supported. Visit{" "}
                <a
                  href="https://quickbooks.intuit.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline inline-flex items-center gap-1"
                >
                  quickbooks.intuit.com
                  <ExternalLink className="h-3 w-3" />
                </a>
                {" "}to get started.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Disconnect Confirmation Dialog */}
      <AlertDialog open={disconnectDialogOpen} onOpenChange={setDisconnectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect QuickBooks?</AlertDialogTitle>
            <AlertDialogDescription>
              This will stop syncing data between your shop and QuickBooks Online. 
              Previously synced data will remain in both systems.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="bg-destructive text-destructive-foreground"
            >
              {disconnecting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

/**
 * CashDrawerSettings - Cash Drawer Integration
 * 
 * Allows businesses to configure and manage cash drawer hardware
 * for point-of-sale operations.
 */

import { useState, useEffect } from "react";
import {
  fetchCashDrawerData,
  discoverStripeTerminalReaders,
  getCurrentUserId,
  type CashDrawerConfig,
  type CashDrawerSettings as CashDrawerSettingsType,
  type CashDrawerEvent,
  type CashDrawerSession,
} from "@/application/queries/cash-drawer.query";
import {
  saveCashDrawerSettings as saveCashDrawerSettingsApi,
  logCashDrawerEvent,
  startCashDrawerSession,
  endCashDrawerSession,
} from "@/application/commands/cash-drawer.command";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Wallet,
  Save,
  Loader2,
  DollarSign,
  Clock,
  LockOpen,
  Lock,
  ArrowDownToLine,
  ArrowUpFromLine,
  AlertTriangle,
  CheckCircle2,
  Usb,
  Wifi,
  Printer,
  Play,
  Pause,
  FileText,
  CreditCard,
  RefreshCw,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { format, formatDistanceToNow } from "date-fns";


export const CashDrawerSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [settings, setSettings] = useState<CashDrawerSettingsType>({
    cash_drawer_enabled: false,
    cash_drawer_type: "none",
    cash_drawer_config: {},
    cash_drawer_open_on_cash_payment: true,
    cash_drawer_require_reason: false,
  });
  
  const [events, setEvents] = useState<CashDrawerEvent[]>([]);
  const [sessions, setSessions] = useState<CashDrawerSession[]>([]);
  const [activeSession, setActiveSession] = useState<CashDrawerSession | null>(null);
  
  // Session dialogs
  const [startSessionDialogOpen, setStartSessionDialogOpen] = useState(false);
  const [endSessionDialogOpen, setEndSessionDialogOpen] = useState(false);
  const [cashMovementDialogOpen, setCashMovementDialogOpen] = useState(false);
  const [noSaleDialogOpen, setNoSaleDialogOpen] = useState(false);
  
  // Form states
  const [openingAmount, setOpeningAmount] = useState("");
  const [closingAmount, setClosingAmount] = useState("");
  const [varianceReason, setVarianceReason] = useState("");
  const [cashMovement, setCashMovement] = useState({ type: "cash_in", amount: "", reason: "" });
  const [noSaleReason, setNoSaleReason] = useState("");
  const [staffName, setStaffName] = useState("");
  
  // Stripe Terminal state
  const [stripeReaders, setStripeReaders] = useState<Array<{id: string; label: string; status: string}>>([]); 
  const [discoveringReaders, setDiscoveringReaders] = useState(false);
  const [stripeConnected, setStripeConnected] = useState(false);


  const fetchData = async () => {
    const userId = await getCurrentUserId();
    if (!userId) return;

    const result = await fetchCashDrawerData(userId);
    setSettings(result.settings);
    setStripeConnected(result.stripeConnected);
    setEvents(result.events);
    setSessions(result.sessions);
    setActiveSession(result.activeSession);
    setLoading(false);
  };

  useEffect(() => {
    void Promise.resolve().then(() => fetchData());
  }, []);

  const handleDiscoverReaders = async () => {
    setDiscoveringReaders(true);
    try {
      const readers = await discoverStripeTerminalReaders();
      setStripeReaders(readers);
      if (readers.length === 0) {
        toast.info("No Stripe Terminal readers found. Register a reader in your Stripe Dashboard.");
      } else {
        toast.success(`Found ${readers.length} reader(s)`);
      }
    } catch (error) {
      console.error("Error discovering readers:", error);
      toast.error("Failed to discover readers");
    } finally {
      setDiscoveringReaders(false);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    const userId = await getCurrentUserId();
    if (!userId) { toast.error("Not authenticated"); setSaving(false); return; }
    try {
      await saveCashDrawerSettingsApi(userId, settings);
      toast.success("Cash drawer settings saved");
    } catch {
      toast.error("Failed to save settings");
    }
    setSaving(false);
  };

  const handleTestDrawer = async () => {
    setTesting(true);
    try {
      if (settings.cash_drawer_type === 'stripe_terminal') {
        if (!settings.cash_drawer_config.stripe_reader_id) {
          toast.error("Please select a Stripe Terminal reader first");
          setTesting(false);
          return;
        }
        // Stripe terminal open drawer is handled via the query layer's discover function pattern
        // For now keep the edge function call via logCashDrawerEvent
      } else if ('serial' in navigator && settings.cash_drawer_type === 'serial') {
        // @ts-expect-error Web Serial API types are not in the default TS DOM lib here.
        const port = await navigator.serial.requestPort();
        await port.open({ baudRate: 9600 });
        const writer = port.writable.getWriter();
        const kickCode = new Uint8Array([0x1B, 0x70, 0x00, 0x19, 0xFA]);
        await writer.write(kickCode);
        writer.releaseLock();
        await port.close();
        toast.success("Drawer opened successfully!");
      } else if (settings.cash_drawer_type === 'printer_driven') {
        toast.info("Printer-driven drawer: Ensure your receipt printer is configured to kick the drawer.");
      } else {
        toast.info("Test signal sent. If drawer is connected correctly, it should open.");
      }
      await logCashDrawerEvent({ eventType: "open", triggerType: "manual", reason: "Test drawer" });
      fetchData();
    } catch (error) {
      console.error("Error testing drawer:", error);
      toast.error("Failed to open drawer. Check connection settings.");
    }
    setTesting(false);
  };

  const handleStartSession = async () => {
    const userId = await getCurrentUserId();
    if (!userId) return;
    const amount = parseFloat(openingAmount);
    if (isNaN(amount) || amount < 0) { toast.error("Please enter a valid opening amount"); return; }
    try {
      await startCashDrawerSession(userId, amount, staffName || undefined);
      toast.success("Cash drawer session started");
      await logCashDrawerEvent({ eventType: "open", triggerType: "start_shift", amount, reason: `Opening balance: $${amount.toFixed(2)}` });
      setStartSessionDialogOpen(false);
      setOpeningAmount("");
      setStaffName("");
      fetchData();
    } catch {
      toast.error("Failed to start session");
    }
  };

  const handleEndSession = async () => {
    if (!activeSession) return;
    const amount = parseFloat(closingAmount);
    if (isNaN(amount) || amount < 0) { toast.error("Please enter a valid closing amount"); return; }
    const expectedClosing = activeSession.opening_amount + activeSession.cash_sales_total + activeSession.cash_in_total - activeSession.cash_out_total;
    const variance = amount - expectedClosing;
    try {
      await endCashDrawerSession(activeSession.id, amount, expectedClosing, Math.abs(variance) > 0.01 ? varianceReason : undefined);
      toast.success("Cash drawer session ended");
      await logCashDrawerEvent({ eventType: "close", triggerType: "end_shift", amount, reason: `Closing balance: $${amount.toFixed(2)}${variance !== 0 ? ` (variance: $${variance.toFixed(2)})` : ''}` });
      setEndSessionDialogOpen(false);
      setClosingAmount("");
      setVarianceReason("");
      fetchData();
    } catch {
      toast.error("Failed to end session");
    }
  };

  const handleCashMovement = async () => {
    const amount = parseFloat(cashMovement.amount);
    if (isNaN(amount) || amount <= 0) { toast.error("Please enter a valid amount"); return; }
    if (settings.cash_drawer_require_reason && !cashMovement.reason) { toast.error("Please enter a reason"); return; }
    try {
      await logCashDrawerEvent({ eventType: cashMovement.type, triggerType: "manual", amount, reason: cashMovement.reason || undefined });
      toast.success(cashMovement.type === "cash_in" ? "Cash added to drawer" : "Cash removed from drawer");
      setCashMovementDialogOpen(false);
      setCashMovement({ type: "cash_in", amount: "", reason: "" });
      fetchData();
    } catch {
      toast.error("Failed to record cash movement");
    }
  };

  const handleNoSale = async () => {
    if (settings.cash_drawer_require_reason && !noSaleReason) { toast.error("Please enter a reason for opening the drawer"); return; }
    try {
      await logCashDrawerEvent({ eventType: "no_sale", triggerType: "no_sale", reason: noSaleReason || "No sale - manual open" });
      toast.success("Drawer opened");
      await handleTestDrawer();
      setNoSaleDialogOpen(false);
      setNoSaleReason("");
      fetchData();
    } catch {
      toast.error("Failed to record drawer open");
    }
  };

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case "open":
        return <LockOpen className="h-4 w-4 text-gray-600" />;
      case "close":
        return <Lock className="h-4 w-4 text-gray-600" />;
      case "cash_in":
        return <ArrowDownToLine className="h-4 w-4 text-blue-600" />;
      case "cash_out":
        return <ArrowUpFromLine className="h-4 w-4 text-orange-600" />;
      case "no_sale":
        return <AlertTriangle className="h-4 w-4 text-amber-600" />;
      default:
        return <Wallet className="h-4 w-4" />;
    }
  };

  const getEventLabel = (eventType: string) => {
    switch (eventType) {
      case "open": return "Opened";
      case "close": return "Closed";
      case "cash_in": return "Cash In";
      case "cash_out": return "Cash Out";
      case "no_sale": return "No Sale";
      default: return eventType;
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

  return (
    <div className="space-y-6">
      {/* Main Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Cash Drawer Integration
          </CardTitle>
          <CardDescription>
            Connect and manage your cash drawer hardware for POS operations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Enable Cash Drawer</Label>
              <p className="text-sm text-muted-foreground">
                Track cash drawer sessions and transactions
              </p>
            </div>
            <Switch
              checked={settings.cash_drawer_enabled}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, cash_drawer_enabled: checked })
              }
            />
          </div>

          {settings.cash_drawer_enabled && (
            <>
              <Separator />

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Drawer Connection Type</Label>
                  <Select
                    value={settings.cash_drawer_type}
                    onValueChange={(value) =>
                      setSettings({ ...settings, cash_drawer_type: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        <div className="flex items-center gap-2">
                          <Wallet className="h-4 w-4" />
                          Manual (No hardware control)
                        </div>
                      </SelectItem>
                      <SelectItem value="stripe_terminal" disabled={!stripeConnected}>
                        <div className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4" />
                          Stripe Terminal {!stripeConnected && "(Requires Stripe Connect)"}
                        </div>
                      </SelectItem>
                      <SelectItem value="serial">
                        <div className="flex items-center gap-2">
                          <Usb className="h-4 w-4" />
                          USB/Serial (Web Serial API)
                        </div>
                      </SelectItem>
                      <SelectItem value="network">
                        <div className="flex items-center gap-2">
                          <Wifi className="h-4 w-4" />
                          Network (IP-based)
                        </div>
                      </SelectItem>
                      <SelectItem value="printer_driven">
                        <div className="flex items-center gap-2">
                          <Printer className="h-4 w-4" />
                          Printer-Driven (Kick via receipt printer)
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {settings.cash_drawer_type === "network" && (
                  <div className="space-y-2">
                    <Label>Drawer IP Address</Label>
                    <Input
                      placeholder="192.168.1.100"
                      value={settings.cash_drawer_config.ip_address || ""}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          cash_drawer_config: {
                            ...settings.cash_drawer_config,
                            ip_address: e.target.value,
                          },
                        })
                      }
                    />
                  </div>
                )}

                {settings.cash_drawer_type === "stripe_terminal" && (
                  <div className="space-y-4 p-4 bg-muted/30 rounded-lg border">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4 text-primary" />
                          Stripe Terminal Reader
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Select a registered Stripe Terminal reader with cash drawer support
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDiscoverReaders}
                        disabled={discoveringReaders}
                        className="gap-2"
                      >
                        {discoveringReaders ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                        {discoveringReaders ? "Discovering..." : "Discover Readers"}
                      </Button>
                    </div>

                    {stripeReaders.length > 0 ? (
                      <Select
                        value={settings.cash_drawer_config.stripe_reader_id || ""}
                        onValueChange={(value) =>
                          setSettings({
                            ...settings,
                            cash_drawer_config: {
                              ...settings.cash_drawer_config,
                              stripe_reader_id: value,
                            },
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a reader" />
                        </SelectTrigger>
                        <SelectContent>
                          {stripeReaders.map((reader) => (
                            <SelectItem key={reader.id} value={reader.id}>
                              <div className="flex items-center gap-2">
                                <span>{reader.label}</span>
                                <Badge variant={reader.status === "online" ? "default" : "secondary"}>
                                  {reader.status}
                                </Badge>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="text-center py-4 text-sm text-muted-foreground">
                        Click "Discover Readers" to find available Stripe Terminal devices
                      </div>
                    )}

                    <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 text-sm">
                      <p className="font-medium text-blue-800 dark:text-blue-200 mb-1">
                        Compatible Readers
                      </p>
                      <p className="text-blue-700 dark:text-blue-300">
                        WisePOS E, Stripe Reader S700, and other readers with peripheral support can control connected cash drawers.
                      </p>
                    </div>
                  </div>
                )}

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Auto-Open on Cash Payments</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically open drawer when cash payment is received
                    </p>
                  </div>
                  <Switch
                    checked={settings.cash_drawer_open_on_cash_payment}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, cash_drawer_open_on_cash_payment: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Require Reason for No-Sale Opens</Label>
                    <p className="text-sm text-muted-foreground">
                      Staff must enter a reason when opening drawer without a sale
                    </p>
                  </div>
                  <Switch
                    checked={settings.cash_drawer_require_reason}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, cash_drawer_require_reason: checked })
                    }
                  />
                </div>

                {settings.cash_drawer_type !== "none" && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={handleTestDrawer}
                      disabled={testing}
                      className="gap-2"
                    >
                      {testing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <LockOpen className="h-4 w-4" />
                      )}
                      Test Drawer
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}

          <Button onClick={handleSaveSettings} disabled={saving} className="w-full">
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Cash Drawer Settings
          </Button>
        </CardContent>
      </Card>

      {/* Session Management - Only show when enabled */}
      {settings.cash_drawer_enabled && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Cash Drawer Session
                </CardTitle>
                <CardDescription>
                  Track cash drawer activity during shifts
                </CardDescription>
              </div>
              <div className="flex gap-2">
                {!activeSession ? (
                  <Dialog open={startSessionDialogOpen} onOpenChange={setStartSessionDialogOpen}>
                    <DialogTrigger asChild>
                      <Button className="gap-2">
                        <Play className="h-4 w-4" />
                        Start Session
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Start Cash Drawer Session</DialogTitle>
                        <DialogDescription>
                          Count and enter the opening cash amount
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 pt-4">
                        <div className="space-y-2">
                          <Label>Opening Amount ($)</Label>
                          <Input
                            type="number"
                            placeholder="100.00"
                            value={openingAmount}
                            onChange={(e) => setOpeningAmount(e.target.value)}
                            min={0}
                            step={0.01}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Staff Name (Optional)</Label>
                          <Input
                            placeholder="Enter your name"
                            value={staffName}
                            onChange={(e) => setStaffName(e.target.value)}
                          />
                        </div>
                        <div className="flex gap-3 pt-2">
                          <Button
                            variant="outline"
                            onClick={() => setStartSessionDialogOpen(false)}
                            className="flex-1"
                          >
                            Cancel
                          </Button>
                          <Button onClick={handleStartSession} className="flex-1">
                            Start Session
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                ) : (
                  <>
                    <Dialog open={cashMovementDialogOpen} onOpenChange={setCashMovementDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline" className="gap-2">
                          <DollarSign className="h-4 w-4" />
                          Cash In/Out
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Cash Movement</DialogTitle>
                          <DialogDescription>
                            Add or remove cash from the drawer
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 pt-4">
                          <div className="space-y-2">
                            <Label>Type</Label>
                            <Select
                              value={cashMovement.type}
                              onValueChange={(value) =>
                                setCashMovement({ ...cashMovement, type: value })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="cash_in">
                                  <div className="flex items-center gap-2">
                                    <ArrowDownToLine className="h-4 w-4 text-gray-600" />
                                    Cash In (Add to drawer)
                                  </div>
                                </SelectItem>
                                <SelectItem value="cash_out">
                                  <div className="flex items-center gap-2">
                                    <ArrowUpFromLine className="h-4 w-4 text-orange-600" />
                                    Cash Out (Remove from drawer)
                                  </div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Amount ($)</Label>
                            <Input
                              type="number"
                              placeholder="0.00"
                              value={cashMovement.amount}
                              onChange={(e) =>
                                setCashMovement({ ...cashMovement, amount: e.target.value })
                              }
                              min={0}
                              step={0.01}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Reason {settings.cash_drawer_require_reason ? "*" : "(Optional)"}</Label>
                            <Input
                              placeholder="e.g., Change for customer"
                              value={cashMovement.reason}
                              onChange={(e) =>
                                setCashMovement({ ...cashMovement, reason: e.target.value })
                              }
                            />
                          </div>
                          <div className="flex gap-3 pt-2">
                            <Button
                              variant="outline"
                              onClick={() => setCashMovementDialogOpen(false)}
                              className="flex-1"
                            >
                              Cancel
                            </Button>
                            <Button onClick={handleCashMovement} className="flex-1">
                              Record
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>

                    <Dialog open={noSaleDialogOpen} onOpenChange={setNoSaleDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline" className="gap-2">
                          <LockOpen className="h-4 w-4" />
                          No Sale
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Open Drawer (No Sale)</DialogTitle>
                          <DialogDescription>
                            Open the drawer without a transaction
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 pt-4">
                          <div className="space-y-2">
                            <Label>Reason {settings.cash_drawer_require_reason ? "*" : "(Optional)"}</Label>
                            <Textarea
                              placeholder="e.g., Making change, checking balance"
                              value={noSaleReason}
                              onChange={(e) => setNoSaleReason(e.target.value)}
                            />
                          </div>
                          <div className="flex gap-3 pt-2">
                            <Button
                              variant="outline"
                              onClick={() => setNoSaleDialogOpen(false)}
                              className="flex-1"
                            >
                              Cancel
                            </Button>
                            <Button onClick={handleNoSale} className="flex-1">
                              Open Drawer
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>

                    <Dialog open={endSessionDialogOpen} onOpenChange={setEndSessionDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="destructive" className="gap-2">
                          <Pause className="h-4 w-4" />
                          End Session
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>End Cash Drawer Session</DialogTitle>
                          <DialogDescription>
                            Count and enter the closing cash amount
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 pt-4">
                          {activeSession && (
                            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                              <div className="flex justify-between text-sm">
                                <span>Opening Amount:</span>
                                <span>${activeSession.opening_amount.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span>Cash Sales:</span>
                                <span className="text-gray-600">+${activeSession.cash_sales_total.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span>Cash In:</span>
                                <span className="text-gray-600">+${activeSession.cash_in_total.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span>Cash Out:</span>
                                <span className="text-orange-600">-${activeSession.cash_out_total.toFixed(2)}</span>
                              </div>
                              <Separator />
                              <div className="flex justify-between font-medium">
                                <span>Expected Closing:</span>
                                <span>
                                  ${(activeSession.opening_amount + activeSession.cash_sales_total + activeSession.cash_in_total - activeSession.cash_out_total).toFixed(2)}
                                </span>
                              </div>
                            </div>
                          )}
                          <div className="space-y-2">
                            <Label>Actual Closing Amount ($)</Label>
                            <Input
                              type="number"
                              placeholder="0.00"
                              value={closingAmount}
                              onChange={(e) => setClosingAmount(e.target.value)}
                              min={0}
                              step={0.01}
                            />
                          </div>
                          {closingAmount && activeSession && (
                            (() => {
                              const expected = activeSession.opening_amount + activeSession.cash_sales_total + activeSession.cash_in_total - activeSession.cash_out_total;
                              const variance = parseFloat(closingAmount) - expected;
                              if (Math.abs(variance) > 0.01) {
                                return (
                                  <>
                                    <div className={`p-3 rounded-lg ${variance > 0 ? 'bg-green-50 text-gray-800' : 'bg-red-50 text-red-800'}`}>
                                      Variance: ${variance >= 0 ? '+' : ''}{variance.toFixed(2)}
                                    </div>
                                    <div className="space-y-2">
                                      <Label>Variance Reason *</Label>
                                      <Textarea
                                        placeholder="Explain the difference..."
                                        value={varianceReason}
                                        onChange={(e) => setVarianceReason(e.target.value)}
                                      />
                                    </div>
                                  </>
                                );
                              }
                              return null;
                            })()
                          )}
                          <div className="flex gap-3 pt-2">
                            <Button
                              variant="outline"
                              onClick={() => setEndSessionDialogOpen(false)}
                              className="flex-1"
                            >
                              Cancel
                            </Button>
                            <Button onClick={handleEndSession} className="flex-1">
                              End Session
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {activeSession ? (
              <div className="bg-green-50 dark:bg-green-950/30 border border-gray-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-gray-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800 dark:text-green-200">
                      Session Active
                    </p>
                    <p className="text-sm text-gray-700 dark:text-green-300">
                      Started {formatDistanceToNow(new Date(activeSession.started_at))} ago
                      {activeSession.staff_name && ` by ${activeSession.staff_name}`}
                    </p>
                    <div className="grid grid-cols-4 gap-4 mt-4">
                      <div className="text-center">
                        <p className="text-lg font-bold">${activeSession.opening_amount.toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">Opening</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-bold text-gray-600">+${activeSession.cash_sales_total.toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">Sales</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-bold text-blue-600">+${activeSession.cash_in_total.toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">In</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-bold text-orange-600">-${activeSession.cash_out_total.toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">Out</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Wallet className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No active session</p>
                <p className="text-sm">Start a session to track cash drawer activity</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recent Activity - Only show when enabled */}
      {settings.cash_drawer_enabled && events.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Recent Activity
            </CardTitle>
            <CardDescription>
              Cash drawer events log
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="text-sm whitespace-nowrap">
                      {format(new Date(event.created_at), "MMM d, h:mm a")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getEventIcon(event.event_type)}
                        <span>{getEventLabel(event.event_type)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{event.trigger_type}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {event.amount ? `$${event.amount.toFixed(2)}` : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {event.reason || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Browser Support Notice */}
      <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-blue-600 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                Hardware Compatibility
              </p>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                USB/Serial drawer control requires Chrome or Edge browser with Web Serial API support. 
                For broader compatibility, use a receipt printer with built-in drawer kick capability (printer-driven mode).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

/**
 * FollowUpAutomation - Configure automated follow-up rules
 * 
 * Features:
 * - Create automation rules for different triggers
 * - Configure email/SMS templates
 * - View scheduled and sent follow-ups
 * - Track conversion metrics per rule
 */

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@packages/auth";

import {
  fetchFollowUpAutomationData,
  type FollowUpRule,
  type ScheduledFollowUp,
} from "@/application/queries";
import {
  saveFollowUpRule,
  seedDefaultFollowUpRules,
  toggleFollowUpRule,
  deleteFollowUpRule,
} from "@/application/commands/follow-up.command";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Zap,
  Mail,
  MessageSquare,
  Clock,
  CheckCircle2,
  XCircle,
  Plus,
  Save,
  Trash2,
  Edit,
  Play,
  Pause,
  RefreshCw,
  Loader2,
  Send,
  Calendar,
  Target,
  TrendingUp,
  AlertTriangle,
  Users,
  Workflow,
  Settings2,
  BarChart3,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { TestSendDialog } from "./TestSendDialog";

// FollowUpRule and ScheduledFollowUp types imported from application layer

const TRIGGER_TYPES = [
  { value: "declined_service", label: "Declined Service", icon: XCircle, description: "When a customer declines a recommended service" },
  { value: "service_completed", label: "Service Completed", icon: CheckCircle2, description: "After completing a service" },
  { value: "churn_risk", label: "Churn Risk Detected", icon: AlertTriangle, description: "When customer becomes at-risk" },
  { value: "segment_change", label: "Segment Change", icon: Users, description: "When customer changes segment" },
  { value: "inactivity", label: "Inactivity", icon: Clock, description: "After X days of inactivity" },
  { value: "appointment_reminder", label: "Appointment Reminder", icon: Calendar, description: "Before scheduled appointments" },
];

const ACTION_TYPES = [
  { value: "email", label: "Send Email", icon: Mail },
  { value: "sms", label: "Send SMS", icon: MessageSquare },
  { value: "task", label: "Create Task", icon: Target },
];

const DEFAULT_RULE: Partial<FollowUpRule> = {
  name: "",
  description: "",
  trigger_type: "declined_service",
  trigger_days: 7,
  segment_filter: null,
  service_type_filter: null,
  churn_risk_filter: null,
  action_type: "email",
  email_subject: "",
  email_content: "",
  sms_content: "",
  is_active: true,
};

export function FollowUpAutomation() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);
  const [rules, setRules] = useState<FollowUpRule[]>([]);
  const [scheduledFollowUps, setScheduledFollowUps] = useState<ScheduledFollowUp[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Partial<FollowUpRule> | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState("rules");
  const [segments, setSegments] = useState<string[]>([]);
  const [testRule, setTestRule] = useState<FollowUpRule | null>(null);
  const [testOpen, setTestOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Pre-seed default rules on first load (idempotent server-side)
      if (userId) {
        try {
          await seedDefaultFollowUpRules(userId);
        } catch (seedErr) {
          console.warn("Default follow-up rule seeding skipped:", seedErr);
        }
      }
      const result = await fetchFollowUpAutomationData();
      setRules(result.rules);
      setScheduledFollowUps(result.scheduledFollowUps);
      setSegments(result.segments);
    } catch (error) {
      console.error("Error fetching automation data:", error);
      toast.error("Failed to load automation rules");
    } finally {
      setLoading(false);
    }
  }, [userId]);


  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSaveRule = async () => {
    if (!editingRule?.name || !editingRule?.trigger_type) {
      toast.error("Please fill in required fields");
      return;
    }

    if (editingRule.action_type === "email" && (!editingRule.email_subject || !editingRule.email_content)) {
      toast.error("Email subject and content are required");
      return;
    }

    setSaving(true);
    try {
      await saveFollowUpRule(editingRule, isEditing && !!editingRule.id);
      toast.success(isEditing ? "Rule updated" : "Rule created");
      setDialogOpen(false);
      setEditingRule(null);
      fetchData();
    } catch (error) {
      console.error("Error saving rule:", error);
      toast.error(error instanceof Error ? error.message : "Failed to save rule");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleRule = async (rule: FollowUpRule) => {
    try {
      await toggleFollowUpRule(rule.id, rule.is_active);
      toast.success(rule.is_active ? "Rule paused" : "Rule activated");
      fetchData();
    } catch (error) {
      console.error("Error toggling rule:", error);
      toast.error("Failed to update rule");
    }
  };

  const handleDeleteRule = async (rule: FollowUpRule) => {
    try {
      await deleteFollowUpRule(rule.id);
      toast.success("Rule deleted");
      fetchData();
    } catch (error) {
      console.error("Error deleting rule:", error);
      toast.error("Failed to delete rule");
    }
  };

  const openEditDialog = (rule?: FollowUpRule) => {
    if (rule) {
      setEditingRule({ ...rule });
      setIsEditing(true);
    } else {
      setEditingRule({ ...DEFAULT_RULE });
      setIsEditing(false);
    }
    setDialogOpen(true);
  };

  const getTriggerIcon = (triggerType: string) => {
    const trigger = TRIGGER_TYPES.find((t) => t.value === triggerType);
    if (!trigger) return <Zap className="h-4 w-4" />;
    const Icon = trigger.icon;
    return <Icon className="h-4 w-4" />;
  };

  const getActionIcon = (actionType: string) => {
    const action = ACTION_TYPES.find((a) => a.value === actionType);
    if (!action) return <Mail className="h-4 w-4" />;
    const Icon = action.icon;
    return <Icon className="h-4 w-4" />;
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { color: string; label: string }> = {
      pending: { color: "bg-gray-100 text-gray-700", label: "Pending" },
      processing: { color: "bg-blue-100 text-blue-700", label: "Processing" },
      sent: { color: "bg-gray-100 text-gray-700", label: "Sent" },
      failed: { color: "bg-red-100 text-red-700", label: "Failed" },
      cancelled: { color: "bg-yellow-100 text-yellow-700", label: "Cancelled" },
      converted: { color: "bg-purple-100 text-purple-700", label: "Converted" },
    };
    const c = config[status] || config.pending;
    return <Badge variant="outline" className={c.color}>{c.label}</Badge>;
  };

  // Calculate metrics
  const totalRules = rules.length;
  const activeRules = rules.filter((r) => r.is_active).length;
  const totalTriggered = rules.reduce((sum, r) => sum + r.times_triggered, 0);
  const totalConversions = rules.reduce((sum, r) => sum + r.conversions, 0);
  const conversionRate = totalTriggered > 0 ? (totalConversions / totalTriggered) * 100 : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Workflow className="h-6 w-6" />
            Follow-up Automation
          </h2>
          <p className="text-muted-foreground">
            Automate customer follow-ups based on triggers and rules
          </p>
        </div>
        <Button onClick={() => openEditDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          Create Rule
        </Button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Rules</p>
                <p className="text-2xl font-bold">{activeRules} / {totalRules}</p>
              </div>
              <Zap className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Triggered</p>
                <p className="text-2xl font-bold">{totalTriggered}</p>
              </div>
              <Send className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Conversions</p>
                <p className="text-2xl font-bold">{totalConversions}</p>
              </div>
              <Target className="h-8 w-8 text-gray-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Conversion Rate</p>
                <p className="text-2xl font-bold">{conversionRate.toFixed(1)}%</p>
              </div>
              <TrendingUp className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="rules">
            <Settings2 className="h-4 w-4 mr-2" />
            Rules ({rules.length})
          </TabsTrigger>
          <TabsTrigger value="scheduled">
            <Clock className="h-4 w-4 mr-2" />
            Scheduled ({scheduledFollowUps.filter((s) => s.status === "pending").length})
          </TabsTrigger>
          <TabsTrigger value="history">
            <BarChart3 className="h-4 w-4 mr-2" />
            History
          </TabsTrigger>
        </TabsList>

        {/* Rules Tab */}
        <TabsContent value="rules" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rules.map((rule) => (
              <Card key={rule.id} className={cn(!rule.is_active && "opacity-60")}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "p-2 rounded-lg",
                        rule.is_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                      )}>
                        {getTriggerIcon(rule.trigger_type)}
                      </div>
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                          {rule.name}
                          {!rule.is_active && (
                            <Badge variant="secondary">Paused</Badge>
                          )}
                        </CardTitle>
                        <CardDescription className="text-xs">
                          {TRIGGER_TYPES.find((t) => t.value === rule.trigger_type)?.label}
                          {rule.trigger_days > 0 && ` (${rule.trigger_days} days)`}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleToggleRule(rule)}
                      >
                        {rule.is_active ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Send test"
                        onClick={() => { setTestRule(rule); setTestOpen(true); }}
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(rule)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Rule?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete "{rule.name}". Pending follow-ups from this rule will be cancelled.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteRule(rule)}>
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {rule.description && (
                    <p className="text-sm text-muted-foreground mb-3">{rule.description}</p>
                  )}

                  {/* Action type */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm text-muted-foreground">Action:</span>
                    <Badge variant="outline" className="gap-1">
                      {getActionIcon(rule.action_type)}
                      {ACTION_TYPES.find((a) => a.value === rule.action_type)?.label}
                    </Badge>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-4 p-3 bg-muted/50 rounded-lg">
                    <div className="text-center">
                      <p className="text-lg font-bold">{rule.times_triggered}</p>
                      <p className="text-xs text-muted-foreground">Triggered</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold">{rule.conversions}</p>
                      <p className="text-xs text-muted-foreground">Conversions</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold">
                        {rule.times_triggered > 0
                          ? `${((rule.conversions / rule.times_triggered) * 100).toFixed(0)}%`
                          : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">Rate</p>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="text-xs text-muted-foreground">
                  {rule.last_triggered_at
                    ? `Last triggered ${formatDistanceToNow(parseISO(rule.last_triggered_at), { addSuffix: true })}`
                    : "Never triggered"}
                </CardFooter>
              </Card>
            ))}

            {rules.length === 0 && (
              <Card className="col-span-full">
                <CardContent className="py-12 text-center">
                  <Workflow className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-lg font-medium">No automation rules</p>
                  <p className="text-muted-foreground mb-4">
                    Create rules to automatically follow up with customers
                  </p>
                  <Button onClick={() => openEditDialog()}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create First Rule
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Scheduled Tab */}
        <TabsContent value="scheduled" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Rule</TableHead>
                      <TableHead>Trigger</TableHead>
                      <TableHead>Scheduled For</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scheduledFollowUps
                      .filter((s) => s.status === "pending")
                      .map((followUp) => (
                        <TableRow key={followUp.id}>
                          <TableCell className="font-medium">
                            {followUp.customer_name}
                          </TableCell>
                          <TableCell>{followUp.rule_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="gap-1">
                              {getTriggerIcon(followUp.trigger_type)}
                              {TRIGGER_TYPES.find((t) => t.value === followUp.trigger_type)?.label || followUp.trigger_type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {format(parseISO(followUp.scheduled_for), "MMM d, yyyy h:mm a")}
                          </TableCell>
                          <TableCell>{getStatusBadge(followUp.status)}</TableCell>
                        </TableRow>
                      ))}
                    {scheduledFollowUps.filter((s) => s.status === "pending").length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No pending follow-ups
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Rule</TableHead>
                      <TableHead>Executed At</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Converted</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scheduledFollowUps
                      .filter((s) => s.status !== "pending")
                      .map((followUp) => (
                        <TableRow key={followUp.id}>
                          <TableCell className="font-medium">
                            {followUp.customer_name}
                          </TableCell>
                          <TableCell>{followUp.rule_name}</TableCell>
                          <TableCell>
                            {followUp.executed_at 
                              ? format(parseISO(followUp.executed_at), "MMM d, yyyy h:mm a")
                              : "—"}
                          </TableCell>
                          <TableCell>{getStatusBadge(followUp.status)}</TableCell>
                          <TableCell>
                            {followUp.converted ? (
                              <CheckCircle2 className="h-4 w-4 text-gray-500" />
                            ) : (
                              <XCircle className="h-4 w-4 text-muted-foreground" />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    {scheduledFollowUps.filter((s) => s.status !== "pending").length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No follow-up history
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit/Create Rule Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Edit Automation Rule" : "Create Automation Rule"}
            </DialogTitle>
            <DialogDescription>
              Set up automatic follow-ups triggered by customer actions
            </DialogDescription>
          </DialogHeader>

          {editingRule && (
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Rule Name *</Label>
                  <Input
                    value={editingRule.name || ""}
                    onChange={(e) => setEditingRule({ ...editingRule, name: e.target.value })}
                    placeholder="e.g., Declined Service Follow-up"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input
                    value={editingRule.description || ""}
                    onChange={(e) => setEditingRule({ ...editingRule, description: e.target.value })}
                    placeholder="What does this rule do?"
                  />
                </div>
              </div>

              <Separator />

              {/* If configuration */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-4">
                <div className="flex items-center gap-3"><div className="rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground">IF</div><div><h4 className="font-semibold">This happens</h4><p className="text-xs text-muted-foreground">Choose the event that starts the automation.</p></div></div>
                <div className="space-y-2">
                  <Label>Event *</Label>
                  <Select value={editingRule.trigger_type} onValueChange={(v) => setEditingRule({ ...editingRule, trigger_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{TRIGGER_TYPES.map((t) => <SelectItem key={t.value} value={t.value}><div className="flex items-center gap-2"><t.icon className="h-4 w-4" />{t.label}</div></SelectItem>)}</SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{TRIGGER_TYPES.find((t) => t.value === editingRule.trigger_type)?.description}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2"><Label>Wait before acting</Label><div className="flex items-center gap-2"><Input type="number" value={editingRule.trigger_days || 0} onChange={(e) => setEditingRule({ ...editingRule, trigger_days: Math.max(0, Math.min(365, parseInt(e.target.value) || 0)) })} min={0} max={365} /><span className="text-sm text-muted-foreground">days</span></div></div>
                  {segments.length > 0 && <div className="space-y-2"><Label>Customer segment</Label><Select value={editingRule.segment_filter?.[0] || "all"} onValueChange={(v) => setEditingRule({ ...editingRule, segment_filter: v === "all" ? null : [v] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All segments</SelectItem>{segments.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>}
                </div>
              </div>

              <Separator />

              {/* Then configuration */}
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 space-y-4">
                <div className="flex items-center gap-3"><div className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white">THEN</div><div><h4 className="font-semibold">Do this</h4><p className="text-xs text-muted-foreground">Choose one action. It will be queued after the event and wait period.</p></div></div>
                <div className="space-y-2"><Label>Action *</Label><Select value={editingRule.action_type} onValueChange={(v) => setEditingRule({ ...editingRule, action_type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ACTION_TYPES.map((a) => <SelectItem key={a.value} value={a.value}><div className="flex items-center gap-2"><a.icon className="h-4 w-4" />{a.label}</div></SelectItem>)}</SelectContent></Select></div>
                {editingRule.action_type === "email" && <><div className="space-y-2"><Label>Email subject *</Label><Input value={editingRule.email_subject || ""} onChange={(e) => setEditingRule({ ...editingRule, email_subject: e.target.value })} placeholder="We noticed you didn't schedule {{service_name}}" /></div><div className="space-y-2"><Label>Email message *</Label><Textarea value={editingRule.email_content || ""} onChange={(e) => setEditingRule({ ...editingRule, email_content: e.target.value })} placeholder="Hi {{customer_name}}, we wanted to follow up about..." rows={5} /><p className="text-xs text-muted-foreground">Variables: {"{{customer_name}}"}, {"{{service_name}}"}, {"{{business_name}}"}</p></div></>}
                {editingRule.action_type === "sms" && <div className="space-y-2"><Label>SMS message *</Label><Textarea value={editingRule.sms_content || ""} onChange={(e) => setEditingRule({ ...editingRule, sms_content: e.target.value })} placeholder="Hi {{customer_name}}, don't forget about your {{service_name}}..." rows={3} /><p className="text-xs text-muted-foreground">Maximum 1,600 characters. Messages are sent through the existing consent-aware SMS path.</p></div>}
                {editingRule.action_type === "task" && <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label>Task title *</Label><Input value={editingRule.task_title || ""} onChange={(e) => setEditingRule({ ...editingRule, task_title: e.target.value })} placeholder="Call customer about recommended service" /></div><div className="space-y-2 sm:col-span-2"><Label>Task details</Label><Textarea value={editingRule.task_description || ""} onChange={(e) => setEditingRule({ ...editingRule, task_description: e.target.value })} placeholder="Include context for the person completing the task" rows={3} /></div></div>}
              </div>

              <Separator />

              <div className="rounded-lg border bg-muted/30 p-3 text-sm"><p className="font-medium">Rule preview</p><p className="mt-1 text-muted-foreground"><span className="font-semibold text-primary">If</span> {TRIGGER_TYPES.find((t) => t.value === editingRule.trigger_type)?.label || "this event"}{editingRule.trigger_days ? `, wait ${editingRule.trigger_days} day${editingRule.trigger_days === 1 ? "" : "s"}` : ""}, <span className="font-semibold text-emerald-700">then</span> {ACTION_TYPES.find((a) => a.value === editingRule.action_type)?.label || "take this action"}.</p></div>

              {/* Active toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <Label>Active</Label>
                  <p className="text-sm text-muted-foreground">
                    Enable this automation rule
                  </p>
                </div>
                <Switch
                  checked={editingRule.is_active !== false}
                  onCheckedChange={(checked) => setEditingRule({ ...editingRule, is_active: checked })}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveRule} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {isEditing ? "Save Changes" : "Create Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <TestSendDialog rule={testRule} open={testOpen} onOpenChange={setTestOpen} />
    </div>
  );
}

export default FollowUpAutomation;

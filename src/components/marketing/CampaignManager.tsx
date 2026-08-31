import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@packages/auth";
import { fetchActiveSegmentNames } from "@/application/queries/marketing.query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Plus, Send, Clock, Users, Mail, Loader2, Calendar, Trash2, Eye, TestTube2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";
import { CampaignStatus } from "@/lib/enums";
import {
  fetchCampaigns as fetchCampaignsQuery,
  fetchCampaignCustomerCount,
  type CampaignRow,
} from "@/application/queries/campaigns.query";
import {
  createCampaign,
  deleteCampaign as deleteCampaignCmd,
  fetchCampaignAudienceSize,
  previewCampaignRecipients,
  sendCampaign as sendCampaignCmd,
  sendCampaignTest,
} from "@/application/commands/campaigns.command";
import { Checkbox } from "@/components/ui/checkbox";

type Campaign = CampaignRow;

export const CampaignManager = () => {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingCampaignId, setSendingCampaignId] = useState<string | null>(null);
  const [testingCampaignId, setTestingCampaignId] = useState<string | null>(null);
  const [customerCount, setCustomerCount] = useState(0);
  const [previewCampaign, setPreviewCampaign] = useState<Campaign | null>(null);
  const [testCampaign, setTestCampaign] = useState<Campaign | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [previewAudienceSize, setPreviewAudienceSize] = useState<number | null>(null);
  const [previewAudienceLoading, setPreviewAudienceLoading] = useState(false);
  const [newCampaign, setNewCampaign] = useState({
    name: "",
    subject: "",
    content: "",
    recipient_type: "all",
    scheduled_at: "",
  });
  const [segmentNames, setSegmentNames] = useState<string[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();


  // Pre-fill from ?segment=<name> query param sent by segment cards
  useEffect(() => {
    const seg = searchParams.get("segment");
    const prefillSubject = searchParams.get("subject");
    if (!seg) return;
    void Promise.resolve().then(() => setNewCampaign((prev) => ({
      ...prev,
      name: prev.name || `${seg} Campaign`,
      subject: prev.subject || prefillSubject || "",
      recipient_type: `segment:${seg}`,
    })));
    void Promise.resolve().then(() => setDialogOpen(true));
    const next = new URLSearchParams(searchParams);
    next.delete("segment");
    next.delete("subject");
    void Promise.resolve().then(() => setSearchParams(next, { replace: true }));
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!previewCampaign) {
      void Promise.resolve().then(() => setPreviewAudienceSize(null));
      void Promise.resolve().then(() => setPreviewAudienceLoading(false));
      return;
    }

    let cancelled = false;

    const loadAudienceSize = async () => {
      setPreviewAudienceLoading(true);
      try {
        const size = await fetchCampaignAudienceSize(previewCampaign.recipient_type);
        if (!cancelled) {
          setPreviewAudienceSize(size);
        }
      } catch {
        if (!cancelled) {
          setPreviewAudienceSize(null);
          toast.error("Failed to calculate audience size");
        }
      } finally {
        if (!cancelled) {
          setPreviewAudienceLoading(false);
        }
      }
    };

    void Promise.resolve().then(() => loadAudienceSize());

    return () => {
      cancelled = true;
    };
  }, [previewCampaign]);

  const fetchCampaigns = async () => {
    try {
      const data = await fetchCampaignsQuery();
      setCampaigns(data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const fetchCustomerCount = async () => {
    try {
      const count = await fetchCampaignCustomerCount();
      setCustomerCount(count);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    void Promise.resolve().then(() => fetchCampaigns());
    void Promise.resolve().then(() => fetchCustomerCount());
    (async () => {
      if (!user?.id) return;
      const names = await fetchActiveSegmentNames(user.id);
      setSegmentNames(names);
    })();
  }, [user?.id]);

  const [recipientPreview, setRecipientPreview] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [recipientLoading, setRecipientLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewOpen, setPreviewOpen] = useState(false);
  const [draftSelectedIds, setDraftSelectedIds] = useState<Set<string>>(new Set());
  const [recipientDraftDirty, setRecipientDraftDirty] = useState(false);
  const [showDiscardWarning, setShowDiscardWarning] = useState(false);
  const [campaignPendingDeletion, setCampaignPendingDeletion] = useState<Campaign | null>(null);


  const recipientDraftKey = useMemo(
    () => `campaign_recipient_draft_${newCampaign.recipient_type}`,
    [newCampaign.recipient_type],
  );

  const handlePreviewRecipients = async () => {
    setRecipientLoading(true);
    setPreviewOpen(true);
    try {
      const list = await previewCampaignRecipients(newCampaign.recipient_type);
      setRecipientPreview(list);
      const base = new Set(list.map((r) => r.id));
      setSelectedIds(base);
      const savedDraft = localStorage.getItem(recipientDraftKey);
      if (savedDraft) {
        const parsed: string[] = JSON.parse(savedDraft);
        const restored = new Set(parsed);
        setDraftSelectedIds(restored);
        setRecipientDraftDirty(true);
      } else {
        setDraftSelectedIds(base);
        setRecipientDraftDirty(false);
      }
    } catch {
      toast.error("Failed to load recipients");
      setRecipientPreview([]);
      setSelectedIds(new Set());
    } finally {
      setRecipientLoading(false);
    }
  };

  useEffect(() => {
    if (!previewOpen || !recipientDraftDirty) return;
    localStorage.setItem(recipientDraftKey, JSON.stringify(Array.from(draftSelectedIds)));
  }, [previewOpen, recipientDraftDirty, draftSelectedIds, recipientDraftKey]);

  const handleCloseRecipientOverride = () => {
    if (recipientDraftDirty) {
      setShowDiscardWarning(true);
      return;
    }
    setPreviewOpen(false);
  };

  const handleCreateCampaign = async () => {
    if (!newCampaign.name || !newCampaign.subject || !newCampaign.content) {
      toast.error("Please fill in all required fields");
      return;
    }

    // If user opened the preview, only send to the ones they kept checked
    const overrideIds = previewOpen && recipientPreview.length > 0
      ? recipientPreview.filter((r) => draftSelectedIds.has(r.id)).map((r) => r.id)
      : null;

    if (previewOpen && overrideIds && overrideIds.length === 0) {
      toast.error("Select at least one recipient");
      return;
    }

    setSaving(true);
    try {
      await createCampaign({
        name: newCampaign.name,
        subject: newCampaign.subject,
        content: newCampaign.content,
        recipient_type: newCampaign.recipient_type,
        scheduled_at: newCampaign.scheduled_at || null,
        recipient_ids: overrideIds,
      });
      toast.success(
        overrideIds
          ? `Campaign created with ${overrideIds.length} recipient${overrideIds.length === 1 ? "" : "s"}`
          : "Campaign created successfully"
      );
      setDialogOpen(false);
      localStorage.removeItem(recipientDraftKey);
      setRecipientDraftDirty(false);
      setPreviewOpen(false);
      setRecipientPreview([]);
      setSelectedIds(new Set());
      setNewCampaign({ name: "", subject: "", content: "", recipient_type: "all", scheduled_at: "" });
      fetchCampaigns();
    } catch {
      toast.error("Failed to create campaign");
    }
    setSaving(false);
  };

  const handleSendCampaign = async (campaignId: string) => {
    const campaign = campaigns.find((c) => c.id === campaignId);
    if (!campaign) {
      toast.error("Campaign not found");
      return;
    }

    setSendingCampaignId(campaignId);
    try {
      const count = await sendCampaignCmd(campaign);
      toast.success(`Campaign sent to ${count} customers`);
      fetchCampaigns();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send campaign");
    } finally {
      setSendingCampaignId(null);
    }
  };

  const handleSendTestCampaign = async () => {
    if (!testCampaign) return;
    if (!testEmail || !testEmail.includes("@")) {
      toast.error("Enter a valid test email address");
      return;
    }

    setTestingCampaignId(testCampaign.id);
    try {
      await sendCampaignTest(testCampaign, testEmail);
      toast.success(`Test campaign sent to ${testEmail}`);
      setTestCampaign(null);
      setTestEmail("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send test campaign");
    } finally {
      setTestingCampaignId(null);
    }
  };

  const handleDeleteCampaign = async (campaignId: string) => {
    try {
      await deleteCampaignCmd(campaignId);
      toast.success("Campaign deleted");
      fetchCampaigns();
    } catch {
      toast.error("Failed to delete campaign");
    }
  };

  const isIncompleteDraft = (campaign: Campaign) =>
    campaign.status === CampaignStatus.Draft &&
    (campaign.name.trim().length < 5 || campaign.subject.trim().length < 5 || campaign.content.trim().length < 20);

  const getStatusBadge = (status: CampaignStatus, needsDetails = false) => {
    if (needsDetails) {
      return <Badge variant="destructive">Needs details</Badge>;
    }
    switch (status) {
      case CampaignStatus.Draft:
        return <Badge variant="outline">Draft</Badge>;
      case CampaignStatus.Scheduled:
        return <Badge variant="secondary">Scheduled</Badge>;
      case CampaignStatus.Sent:
        return <Badge variant="secondary">Sent</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const campaignAudienceLabel = (recipientType: string) => {
    if (recipientType?.startsWith("segment:")) {
      return `Segment: ${recipientType.slice("segment:".length)}`;
    }
    switch (recipientType) {
      case "recent":
        return "Recent customers";
      case "inactive":
        return "Inactive customers";
      default:
        return "All customers";
    }
  };

  const previewContent = (campaign: Campaign | null) => {
    if (!campaign) return "";
    return campaign.content.replace(/\{customer_name\}/g, "Test Customer");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
               <div className="rounded-lg bg-primary/10 p-2">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{customerCount}</p>
                <p className="text-sm text-muted-foreground">Subscribers</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
               <div className="rounded-lg bg-secondary p-2">
                 <Mail className="h-5 w-5 text-secondary-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{campaigns.filter(c => c.status === CampaignStatus.Sent).length}</p>
                <p className="text-sm text-muted-foreground">Campaigns Sent</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
               <div className="rounded-lg bg-accent p-2">
                 <Clock className="h-5 w-5 text-accent-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{campaigns.filter(c => c.status === CampaignStatus.Scheduled).length}</p>
                <p className="text-sm text-muted-foreground">Scheduled</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
               <div className="rounded-lg bg-muted p-2">
                 <Calendar className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{campaigns.filter(c => c.status === CampaignStatus.Draft).length}</p>
                <p className="text-sm text-muted-foreground">Drafts</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Campaign List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Email Campaigns</CardTitle>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                New Campaign
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby="campaign-dialog-description" onEscapeKeyDown={(e) => { if (previewOpen) { e.preventDefault(); handleCloseRecipientOverride(); } }} onInteractOutside={(e) => { if (previewOpen) { e.preventDefault(); handleCloseRecipientOverride(); } }}>
              <DialogHeader>
                <DialogTitle>Create Email Campaign</DialogTitle>
                <p id="campaign-dialog-description" className="text-sm text-muted-foreground">Set up a new email campaign for your customers.</p>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label>Campaign Name</Label>
                  <Input
                    placeholder="e.g., Spring Service Special"
                    value={newCampaign.name}
                    onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Email Subject</Label>
                  <Input
                    placeholder="e.g., 20% Off All Oil Changes This Week!"
                    value={newCampaign.subject}
                    onChange={(e) => setNewCampaign({ ...newCampaign, subject: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Recipients {recipientDraftDirty && <Badge variant="destructive" className="ml-2">Unsaved changes</Badge>}</Label>
                  <Select
                    value={newCampaign.recipient_type}
                    onValueChange={(value) => {
                      setNewCampaign({ ...newCampaign, recipient_type: value });
                      localStorage.removeItem(recipientDraftKey);
      setRecipientDraftDirty(false);
      setPreviewOpen(false);
                      setRecipientPreview([]);
                      setSelectedIds(new Set());
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Customers ({customerCount})</SelectItem>
                      <SelectItem value="recent">Recent Customers (last 3 months)</SelectItem>
                      <SelectItem value="inactive">Inactive Customers (no service in 6+ months)</SelectItem>
                      {segmentNames.map((name) => (
                        <SelectItem key={name} value={`segment:${name}`}>
                          Segment: {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {previewOpen
                        ? `${draftSelectedIds.size} of ${recipientPreview.length} recipients selected`
                        : "Review the resolved list before saving."}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handlePreviewRecipients}
                      disabled={recipientLoading}
                    >
                      {recipientLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      {previewOpen ? "Refresh list" : "Review & edit list"}
                    </Button>
                  </div>
                  {previewOpen && (
                    <div className="border rounded-lg max-h-56 overflow-y-auto bg-muted/20">
                      {recipientPreview.length === 0 ? (
                        <p className="p-4 text-center text-sm text-muted-foreground">
                          No recipients match this audience.
                        </p>
                      ) : (
                        <>
                          <div className="flex items-center justify-between px-3 py-2 border-b bg-background sticky top-0">
                            <button
                              type="button"
                              className="text-xs text-primary hover:underline"
                              onClick={() => { setDraftSelectedIds(new Set(recipientPreview.map((r) => r.id))); setRecipientDraftDirty(true); }}
                            >
                              Select all
                            </button>
                            <button
                              type="button"
                              className="text-xs text-muted-foreground hover:underline"
                              onClick={() => { setDraftSelectedIds(new Set()); setRecipientDraftDirty(true); }}
                            >
                              Clear
                            </button>
                          </div>
                          <ul className="divide-y">
                            {recipientPreview.map((r) => (
                              <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                                <Checkbox
                                  checked={draftSelectedIds.has(r.id)}
                                  onCheckedChange={(checked) => {
                                    setDraftSelectedIds((prev) => {
                                      const next = new Set(prev);
                                      if (checked) next.add(r.id);
                                      else next.delete(r.id);
                                      return next;
                                    });
                                    setRecipientDraftDirty(true);
                                  }}
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium truncate">{r.name}</p>
                                  <p className="text-xs text-muted-foreground truncate">{r.email}</p>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label>Email Content</Label>
                  <Textarea
                    placeholder="Write your promotional message here..."
                    rows={6}
                    value={newCampaign.content}
                    onChange={(e) => setNewCampaign({ ...newCampaign, content: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Use {"{customer_name}"} to personalize the email
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label>Schedule (optional)</Label>
                  <Input
                    type="datetime-local"
                    value={newCampaign.scheduled_at}
                    onChange={(e) => setNewCampaign({ ...newCampaign, scheduled_at: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty to save as draft
                  </p>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => { if (previewOpen) { handleCloseRecipientOverride(); return; } setDialogOpen(false); }}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateCampaign} disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Create Campaign
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {campaigns.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No campaigns yet. Create your first email campaign!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {campaigns.map((campaign) => {
                const needsDetails = isIncompleteDraft(campaign);

                return (
                <div
                  key={campaign.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{needsDetails ? "Draft needs details" : campaign.name}</h4>
                      {getStatusBadge(campaign.status, needsDetails)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {needsDetails
                        ? "Add a clear title, subject, and message before this campaign can be sent."
                        : campaign.subject}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Created {format(new Date(campaign.created_at), "PPp")}
                      {campaign.scheduled_at && campaign.status === CampaignStatus.Scheduled && ` • Scheduled ${format(new Date(campaign.scheduled_at), "PPp")}`}
                      {campaign.sent_at && ` • Sent to ${campaign.recipient_count} recipients`}
                    </p>
                    {campaign.sent_at && (
                      <p className="text-xs text-muted-foreground">
                        Delivered {campaign.delivered_count} • Opened {campaign.open_count} • Clicked {campaign.click_count} • Replies {campaign.reply_count} • Conversions {campaign.conversion_count}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPreviewCampaign(campaign)}
                      className="gap-1"
                    >
                      <Eye className="h-4 w-4" />
                      Preview
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setTestCampaign(campaign);
                        setTestEmail("");
                      }}
                      className="gap-1"
                    >
                      <TestTube2 className="h-4 w-4" />
                      Test
                    </Button>
                    {campaign.status === CampaignStatus.Draft && !needsDetails && (
                      <Button
                        size="sm"
                        onClick={() => handleSendCampaign(campaign.id)}
                        className="gap-1"
                        disabled={sendingCampaignId === campaign.id}
                      >
                        {sendingCampaignId === campaign.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        Send Now
                      </Button>
                    )}
                    {needsDetails && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPreviewCampaign(campaign)}
                        className="gap-1"
                      >
                        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                        Review draft
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCampaignPendingDeletion(campaign)}
                      aria-label={`Delete ${needsDetails ? "incomplete draft" : campaign.name}`}
                      title={`Delete ${needsDetails ? "incomplete draft" : campaign.name}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(previewCampaign)} onOpenChange={(open) => !open && setPreviewCampaign(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Campaign preview</DialogTitle>
          </DialogHeader>
          {previewCampaign && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Audience</p>
                    <p className="font-medium">{campaignAudienceLabel(previewCampaign.recipient_type)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Estimated recipients</p>
                    <p className="font-medium">
                      {previewAudienceLoading ? "Calculating..." : `${previewAudienceSize ?? 0} customers`}
                    </p>
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <p className="text-sm text-muted-foreground">Subject</p>
                    <p className="font-medium">{previewCampaign.subject}</p>
                  </div>
                </div>
              </div>
              <div className="min-h-[220px] whitespace-pre-wrap rounded-lg border bg-background p-4 text-sm leading-6">
                {previewContent(previewCampaign)}
              </div>
              <p className="text-xs text-muted-foreground">
                Personalization tokens are previewed using sample customer data before sending.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(testCampaign)} onOpenChange={(open) => !open && setTestCampaign(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Send test campaign</DialogTitle>
          </DialogHeader>
          {testCampaign && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                <p className="font-medium">{testCampaign.name}</p>
                <p className="text-muted-foreground">{testCampaign.subject}</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="campaign-test-email">Test recipient email</Label>
                <Input
                  id="campaign-test-email"
                  type="email"
                  placeholder="you@example.com"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  This sends a single promotional test email without queuing the full campaign.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setTestCampaign(null)}>
                  Cancel
                </Button>
                <Button onClick={handleSendTestCampaign} disabled={testingCampaignId === testCampaign.id} className="gap-2">
                  {testingCampaignId === testCampaign.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send test
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(campaignPendingDeletion)}
        onOpenChange={(open) => !open && setCampaignPendingDeletion(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              {campaignPendingDeletion
                ? `Delete “${isIncompleteDraft(campaignPendingDeletion) ? "this incomplete draft" : campaignPendingDeletion.name}”? This cannot be undone.`
                : "This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep campaign</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (campaignPendingDeletion) {
                  handleDeleteCampaign(campaignPendingDeletion.id);
                  setCampaignPendingDeletion(null);
                }
              }}
            >
              Delete campaign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDiscardWarning} onOpenChange={setShowDiscardWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your recipient edits haven't been saved. Closing will lose them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowDiscardWarning(false); setRecipientDraftDirty(false); setDraftSelectedIds(selectedIds); setPreviewOpen(false); }}>
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

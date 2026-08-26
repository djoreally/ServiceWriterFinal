/**
 * TestSendDialog - Preview & send a test for a follow-up rule
 *
 * Email: actually sends via send-email edge function.
 * SMS / Task: preview-only (sms-send requires a real appointment context).
 */
import { useEffect, useState } from "react";
import { fetchCurrentAuthUser } from "@/application/queries/marketing.query";
import { sendMarketingEmail } from "@/application/commands/marketing.command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Mail, MessageSquare, Target, Clock, Loader2, Send } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import type { FollowUpRule } from "@/application/queries";

interface TestSendDialogProps {
  rule: FollowUpRule | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TestSendDialog({ rule, open, onOpenChange }: TestSendDialogProps) {
  const [recipient, setRecipient] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open || !rule) return;
    (async () => {
      const user = await fetchCurrentAuthUser();
      if (rule.action_type === "email") {
        setRecipient(user?.email ?? "");
      } else if (rule.action_type === "sms") {
        setRecipient(user?.phone ?? "");
      } else {
        setRecipient("");
      }
    })();
  }, [open, rule]);

  if (!rule) return null;

  const isEmail = rule.action_type === "email";
  const isSms = rule.action_type === "sms";

  const handleSendTest = async () => {
    if (!isEmail) return;
    if (!recipient || !recipient.includes("@")) {
      toast.error("Enter a valid email address");
      return;
    }
    setSending(true);
    try {
      const subject = `[TEST] ${rule.email_subject || rule.name}`;
      const html = `
        <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #f3f4f6; border-left: 4px solid #0a84ff; padding: 12px 16px; margin-bottom: 16px; border-radius: 4px;">
            <strong>Test preview</strong> &middot; Rule: ${rule.name}<br/>
            <small>Timing: ${rule.trigger_days} day(s) after "${rule.trigger_type}"</small>
          </div>
          <div style="white-space: pre-wrap; line-height: 1.6; color: #111;">
            ${(rule.email_content || "(no content)").replace(/</g, "&lt;")}
          </div>
        </div>
      `;
      await sendMarketingEmail({ to: recipient, subject, html });
      toast.success(`Test email sent to ${recipient}`);
      onOpenChange(false);
    } catch (err) {
      console.error("Test send failed:", err);
      toast.error(err instanceof Error ? err.message : "Failed to send test email");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Test: {rule.name}
          </DialogTitle>
          <DialogDescription>
            Preview the rendered content and timing for this automation rule.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Timing */}
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">
              Sends <strong>{rule.trigger_days} day(s)</strong> after{" "}
              <Badge variant="outline">{rule.trigger_type}</Badge>
            </span>
          </div>

          {/* Action type */}
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1">
              {isEmail && <Mail className="h-3 w-3" />}
              {isSms && <MessageSquare className="h-3 w-3" />}
              {rule.action_type === "task" && <Target className="h-3 w-3" />}
              {rule.action_type.toUpperCase()}
            </Badge>
          </div>

          <Separator />

          {/* Email preview */}
          {isEmail && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Subject</Label>
                <div className="p-2 bg-muted/40 rounded text-sm font-medium">
                  {rule.email_subject || <em className="text-muted-foreground">No subject</em>}
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Body</Label>
                <div className="p-3 bg-muted/40 rounded text-sm whitespace-pre-wrap min-h-[120px]">
                  {rule.email_content || <em className="text-muted-foreground">No content</em>}
                </div>
              </div>
              <div>
                <Label htmlFor="test-recipient">Send test to</Label>
                <Input
                  id="test-recipient"
                  type="email"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
            </div>
          )}

          {/* SMS preview */}
          {isSms && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">SMS Message</Label>
                <div className="p-3 bg-muted/40 rounded text-sm whitespace-pre-wrap">
                  {rule.sms_content || <em className="text-muted-foreground">No content</em>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {(rule.sms_content || "").length} / 160 chars
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Live SMS test sends require a linked appointment and are triggered in production only.
              </p>
            </div>
          )}

          {/* Task preview */}
          {rule.action_type === "task" && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Task content</Label>
                <div className="p-3 bg-muted/40 rounded text-sm whitespace-pre-wrap">
                  {rule.email_content || rule.description || <em className="text-muted-foreground">No content</em>}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Tasks are created in your task list when this rule triggers in production.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {isEmail && (
            <Button onClick={handleSendTest} disabled={sending}>
              {sending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send test email
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

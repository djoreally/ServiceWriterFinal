/**
 * EmailTesting - Component for testing email templates and diagnosing delivery issues
 * 
 * Allows users to:
 * - Send test emails for each template type (booking confirmation, payment receipt, etc.)
 * - View recent email queue entries and their status
 * - Diagnose email delivery problems
 */

import { useState, useEffect } from "react";
import {
  fetchEmailTestingData,
  fetchEmailQueue as fetchEmailQueueData,
  fetchEmailLogs as fetchEmailLogsData,
} from "@/application/queries/email-testing.query";
import { invokeSendTestEmail } from "@/application/commands/email-testing.command";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Mail, Send, CheckCircle2, XCircle, Clock, Loader2, 
  AlertTriangle, RefreshCw, TestTube, Eye, Settings
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { format, formatDistanceToNow } from "date-fns";

// Email template types that can be tested
const EMAIL_TYPES = [
  { value: "booking_confirmation", label: "Booking Confirmation (Customer)", description: "Sent to customer after booking" },
  { value: "booking_confirmation_business", label: "Booking Confirmation (Business)", description: "Sent to you when customer books" },
  { value: "payment_receipt", label: "Payment Receipt", description: "Sent to customer after payment" },
  { value: "payment_received", label: "Payment Received", description: "Sent to you when payment is received" },
  { value: "service_completion", label: "Service Completion", description: "Sent to customer when service is done" },
  { value: "appointment_reminder_24h", label: "Reminder (24 Hours)", description: "Sent 24 hours before appointment" },
  { value: "appointment_reminder_1h", label: "Reminder (1 Hour)", description: "Sent 1 hour before appointment" },
  { value: "review_request", label: "Review Request", description: "Asks customer for a review after service" },
  { value: "promotional", label: "Promotional", description: "Marketing campaign emails" },
  { value: "invoice", label: "Invoice", description: "Invoice email with payment link" },
] as const;

interface EmailQueueEntry {
  id: string;
  email_type: string;
  recipient_email: string;
  recipient_name: string | null;
  status: string;
  scheduled_for: string;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
  source: string;
  retry_count: number;
  review_request_id: string | null;
  campaign_id: string | null;
  provider_message_id: string | null;
  last_event: string | null;
  last_event_at: string | null;
}

interface EmailLogEntry {
  id: string;
  recipient_email: string;
  recipient_name: string | null;
  email_type: string;
  subject: string | null;
  status: string;
  provider: string | null;
  error_message: string | null;
  created_at: string;
  source: string;
  queue_id: string | null;
  review_request_id: string | null;
  campaign_id: string | null;
  provider_message_id: string | null;
  last_event: string | null;
  last_event_at: string | null;
}

interface TestResult {
  success: boolean;
  message: string;
  provider?: string;
  error?: string;
}

export const EmailTesting = () => {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [selectedType, setSelectedType] = useState<string>("booking_confirmation");
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [emailQueue, setEmailQueue] = useState<EmailQueueEntry[]>([]);
  const [emailLogs, setEmailLogs] = useState<EmailLogEntry[]>([]);
  const [businessProfile, setBusinessProfile] = useState<{ business_name: string; email: string } | null>(null);
  const [emailConfigured, setEmailConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const result = await fetchEmailTestingData();
    if (!result) { setLoading(false); return; }

    if (result.profile) {
      setBusinessProfile(result.profile);
      setTestEmail(result.profile.email || result.userEmail || "");
    } else {
      setTestEmail(result.userEmail || "");
    }

    const es = result.emailSettings;
    setEmailConfigured(
      es === null ||
      !es.use_custom_smtp ||
      (es.use_custom_smtp && !!es.smtp_host)
    );

    setEmailQueue(result.emailQueue as EmailQueueEntry[]);
    setEmailLogs(result.emailLogs as unknown as EmailLogEntry[]);
    setLoading(false);
  };

  const fetchEmailQueue = async () => {
    setRefreshing(true);
    const data = await fetchEmailQueueData();
    setEmailQueue(data as EmailQueueEntry[]);
    setRefreshing(false);
  };

  const fetchEmailLogs = async () => {
    const data = await fetchEmailLogsData();
    setEmailLogs(data as unknown as EmailLogEntry[]);
  };

  const handleSendTestEmail = async () => {
    if (!testEmail || !testEmail.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }

    setSending(true);
    setTestResult(null);

    try {
      const { data, error } = await invokeSendTestEmail({
        to: testEmail,
        type: selectedType,
        customerName: "Test Customer",
        businessName: businessProfile?.business_name || "Your Auto Shop",
        businessEmail: businessProfile?.email,
        serviceName: "Oil Change (Test)",
        scheduledDate: format(new Date(), "EEEE, MMMM d, yyyy"),
        scheduledTime: "10:00 AM",
        estimatedDuration: 30,
        totalAmount: "$49.99",
        vehicleInfo: "2023 Toyota Camry",
        documentNumber: "INV-TEST-001",
        paymentDate: format(new Date(), "MMMM d, yyyy"),
        serviceDescription: "Full synthetic oil change with filter",
        googleReviewUrl: "https://google.com/review",
        yelpReviewUrl: "https://yelp.com/review",
        bookingSlug: "test-shop",
        lastServiceDate: format(new Date(), "MMMM d, yyyy"),
      });

      if (error) {
        setTestResult({ success: false, message: "Failed to send test email", error: error.message });
        toast.error(`Test failed: ${error.message}`);
      } else if (data?.success === false) {
        setTestResult({ success: false, message: data.error || "Email sending failed", error: data.error });
        toast.error(`Test failed: ${data.error}`);
      } else {
        setTestResult({ success: true, message: `Test email sent to ${testEmail}`, provider: data?.provider || "enginemailer" });
        toast.success("Test email sent! Check your inbox.");
      }
    } catch (err) {
      const error = err as Error;
      setTestResult({ success: false, message: "Unexpected error", error: error.message });
      toast.error(`Error: ${error.message}`);
    }

    setSending(false);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "sent":
        return <Badge variant="secondary"><CheckCircle2 className="w-3 h-3 mr-1" />Sent</Badge>;
      case "pending":
        return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case "failed":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      case "processing":
        return <Badge variant="secondary"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Processing</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const selectedTypeInfo = EMAIL_TYPES.find(t => t.value === selectedType);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Configuration Status Alert */}
      {emailConfigured === false && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Email Not Configured</AlertTitle>
          <AlertDescription>
            Your email settings are incomplete. Please configure your email settings in{" "}
            <a href="/settings" className="underline font-medium">Settings → Email</a> before testing.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="test" className="space-y-4">
        <TabsList>
          <TabsTrigger value="test" className="gap-2">
            <TestTube className="h-4 w-4" />
            Send Test
          </TabsTrigger>
          <TabsTrigger value="queue" className="gap-2">
            <Mail className="h-4 w-4" />
            Email Queue
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2">
            <Eye className="h-4 w-4" />
            Email Logs ({emailLogs.length})
          </TabsTrigger>
        </TabsList>

        {/* Test Email Tab */}
        <TabsContent value="test">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TestTube className="h-5 w-5" />
                Send Test Email
              </CardTitle>
              <CardDescription>
                Test your email templates to verify they're being delivered correctly.
                The test email will be sent using your current email configuration.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Email Type Selection */}
              <div className="space-y-2">
                <Label htmlFor="email-type">Email Template Type</Label>
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger id="email-type">
                    <SelectValue placeholder="Select email type" />
                  </SelectTrigger>
                  <SelectContent>
                    {EMAIL_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex flex-col">
                          <span>{type.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedTypeInfo && (
                  <p className="text-sm text-muted-foreground">
                    {selectedTypeInfo.description}
                  </p>
                )}
              </div>

              {/* Test Email Address */}
              <div className="space-y-2">
                <Label htmlFor="test-email">Send Test To</Label>
                <Input
                  id="test-email"
                  type="email"
                  placeholder="your@email.com"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  The test email will be sent to this address with sample data.
                </p>
              </div>

              {/* Send Button */}
              <Button 
                onClick={handleSendTestEmail} 
                disabled={sending || !testEmail}
                className="w-full sm:w-auto"
              >
                {sending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Send Test Email
                  </>
                )}
              </Button>

              {/* Test Result */}
              {testResult && (
                <Alert variant={testResult.success ? "default" : "destructive"}>
                  {testResult.success ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  <AlertTitle>{testResult.success ? "Success" : "Failed"}</AlertTitle>
                  <AlertDescription>
                    {testResult.message}
                    {testResult.provider && (
                      <span className="block mt-1 text-sm">
                        Provider: {testResult.provider === "smtp" ? "Custom SMTP" : "Resend (Platform Default)"}
                      </span>
                    )}
                    {testResult.error && (
                      <span className="block mt-1 text-sm font-mono bg-muted p-2 rounded mt-2">
                        {testResult.error}
                      </span>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {/* Tips */}
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Troubleshooting Tips
                </h4>
                <ul className="text-sm text-muted-foreground space-y-1 ml-6 list-disc">
                  <li>Check your spam/junk folder if the email doesn't arrive</li>
                  <li>Verify your email settings in <a href="/settings" className="underline">Settings → Email</a></li>
                  <li>If using custom SMTP, ensure your credentials are correct</li>
                  <li>Allow a few minutes for delivery - some providers have delays</li>
                  <li>Gmail users: Check the "Promotions" or "Updates" tab</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Email Queue Tab */}
        <TabsContent value="queue">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Mail className="h-5 w-5" />
                    Email Queue
                  </CardTitle>
                  <CardDescription>
                    Recent emails that have been queued or sent from your account.
                  </CardDescription>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => fetchEmailQueue()}
                  disabled={refreshing}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {emailQueue.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No emails in queue yet.</p>
                  <p className="text-sm">Emails from campaigns and automated flows will appear here.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {emailQueue.map((entry) => (
                    <div 
                      key={entry.id} 
                      className="flex items-start justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          {getStatusBadge(entry.status)}
                          <Badge variant="outline" className="capitalize">
                            {entry.email_type.replace(/_/g, " ")}
                          </Badge>
                        </div>
                        <p className="font-medium">
                          {entry.recipient_name || entry.recipient_email}
                        </p>
                        {entry.recipient_name && (
                          <p className="text-sm text-muted-foreground">
                            {entry.recipient_email}
                          </p>
                        )}
                        {entry.error_message && (
                          <p className="text-sm text-destructive mt-1">
                            Error: {entry.error_message}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Badge variant="secondary" className="text-xs">Source: {entry.source || "unknown"}</Badge>
                          {entry.retry_count > 0 && (
                            <Badge variant="secondary" className="text-xs">Retries: {entry.retry_count}</Badge>
                          )}
                          {entry.last_event && (
                            <Badge variant="outline" className="text-xs">Event: {entry.last_event}</Badge>
                          )}
                          {entry.campaign_id && <Badge variant="outline" className="text-xs">Campaign</Badge>}
                          {entry.review_request_id && <Badge variant="outline" className="text-xs">Review</Badge>}
                        </div>
                      </div>
                      <div className="text-right text-sm text-muted-foreground">
                        <p>{formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}</p>
                        {entry.sent_at && (
                          <p className="text-muted-foreground">
                            Sent {format(new Date(entry.sent_at), "MMM d, h:mm a")}
                          </p>
                        )}
                        {entry.last_event_at && (
                          <p>Updated {format(new Date(entry.last_event_at), "MMM d, h:mm a")}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Email Logs Tab */}
        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Eye className="h-5 w-5" />
                    Email Delivery Logs
                  </CardTitle>
                  <CardDescription>
                    Every email sent from your account is logged here for tracking and debugging.
                  </CardDescription>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => fetchEmailLogs()}
                  disabled={refreshing}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {emailLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No email logs yet.</p>
                  <p className="text-sm">All sent emails will be tracked here going forward.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {emailLogs.map((log) => (
                    <div 
                      key={log.id} 
                      className="flex items-start justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          {log.status === "sent" ? (
                            <Badge variant="secondary">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Sent
                            </Badge>
                          ) : (
                            <Badge variant="destructive">
                              <XCircle className="h-3 w-3 mr-1" /> Failed
                            </Badge>
                          )}
                          <Badge variant="outline" className="capitalize">
                            {log.email_type.replace(/_/g, " ")}
                          </Badge>
                          {log.provider && (
                            <Badge variant="secondary" className="text-xs">
                              {log.provider}
                            </Badge>
                          )}
                        </div>
                        <p className="font-medium">{log.recipient_name || log.recipient_email}</p>
                        {log.recipient_name && (
                          <p className="text-sm text-muted-foreground">{log.recipient_email}</p>
                        )}
                        {log.subject && (
                          <p className="text-sm text-muted-foreground truncate max-w-md">
                            Subject: {log.subject}
                          </p>
                        )}
                        {log.error_message && (
                          <p className="text-sm text-destructive mt-1">
                            Error: {log.error_message}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Badge variant="secondary" className="text-xs">Source: {log.source || "unknown"}</Badge>
                          {log.last_event && <Badge variant="outline" className="text-xs">Event: {log.last_event}</Badge>}
                          {log.queue_id && <Badge variant="outline" className="text-xs">Queued</Badge>}
                          {log.campaign_id && <Badge variant="outline" className="text-xs">Campaign</Badge>}
                          {log.review_request_id && <Badge variant="outline" className="text-xs">Review</Badge>}
                        </div>
                      </div>
                      <div className="text-right text-sm text-muted-foreground whitespace-nowrap">
                        <p>{formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}</p>
                        <p>{format(new Date(log.created_at), "MMM d, h:mm a")}</p>
                        {log.last_event_at && <p>Updated {format(new Date(log.last_event_at), "MMM d, h:mm a")}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

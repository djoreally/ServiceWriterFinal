import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FleetOSLayout } from "@/components/layout/FleetOSLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  Inbox,
  Loader2,
  Mail,
  RefreshCw,
  Reply,
  Search,
  Send,
  Settings,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/components/ui/sonner";
import {
  fetchFleetEmailMessages,
  fetchFleetMailboxConfiguration,
  subscribeToFleetEmailMessages,
  type FleetEmailMessage,
  type FleetMailboxConfiguration,
} from "@/application/queries/fleet-email.query";
import { markFleetEmailRead, replyToFleetEmail, syncFleetMailbox } from "@/application/commands/fleet-email.command";
import { createFleetRequestFromEmail } from "@/application/queries/fleet-service-requests.query";

type MailboxView = "inbox" | "unread" | "sent";

const formatMessageTime = (value: string): string => {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
};

export default function FleetEmailInboxPage() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<FleetEmailMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [search, setSearch] = useState("");
  const [mailboxView, setMailboxView] = useState<MailboxView>("inbox");
  const [mobileReaderOpen, setMobileReaderOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [configuration, setConfiguration] = useState<FleetMailboxConfiguration | null>(null);
  const syncInFlight = useRef(false);

  const load = useCallback(async () => {
    try {
      const [nextMessages, nextConfiguration] = await Promise.all([fetchFleetEmailMessages(), fetchFleetMailboxConfiguration()]);
      setMessages(nextMessages);
      setConfiguration(nextConfiguration);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load email");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(() => load()); return subscribeToFleetEmailMessages(() => void load()); }, [load]);
  useEffect(() => {
    if (!configuration?.imap_configured) return;
    const refresh = (): void => {
      if (document.visibilityState === "hidden" || syncInFlight.current) return;
      syncInFlight.current = true;
      void syncFleetMailbox().then(load).catch((): void => undefined).finally(() => { syncInFlight.current = false; });
    };
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(timer);
  }, [configuration?.imap_configured, load]);

  const threads = useMemo(() => {
    const seen = new Set<string>();
    return messages.filter((message) => !seen.has(message.thread_key) && Boolean(seen.add(message.thread_key)));
  }, [messages]);
  const unreadCount = threads.filter((message) => !message.is_read && message.direction === "inbound").length;
  const filteredThreads = useMemo(() => {
    const term = search.trim().toLowerCase();
    return threads.filter((message) => {
      const matchesView = mailboxView === "sent" ? message.direction === "outbound" : message.direction === "inbound" && (mailboxView !== "unread" || !message.is_read);
      const matchesSearch = !term || [message.from_name, message.from_email, message.subject, message.body_text].some((value) => value?.toLowerCase().includes(term));
      return matchesView && matchesSearch;
    });
  }, [mailboxView, search, threads]);
  const selected = messages.find((message) => message.id === selectedId)
    ?? filteredThreads[0]
    ?? null;
  const conversation = selected ? [...messages.filter((message) => message.thread_key === selected.thread_key)].reverse() : [];
  const notConfigured = Boolean(configuration) && !configuration?.smtp_configured && !configuration?.imap_configured;

  const select = (message: FleetEmailMessage) => {
    setSelectedId(message.id);
    setMobileReaderOpen(true);
    if (!message.is_read) void markFleetEmailRead(message.id).then(load);
  };
  const sync = async () => {
    if (syncInFlight.current) return;
    syncInFlight.current = true;
    setWorking(true);
    try {
      const result = await syncFleetMailbox();
      toast.success(`Mailbox synced: ${result.imported || 0} new message(s)`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mailbox sync failed");
    } finally {
      syncInFlight.current = false;
      setWorking(false);
    }
  };
  const handleRequestDisposition = async (disposition: "service_request" | "non_service") => {
    if (!selected) return;
    setWorking(true);
    try {
      const requestId = await createFleetRequestFromEmail(selected.id, disposition);
      toast.success(disposition === "service_request" ? "Service request created" : "Email closed as non-service");
      if (disposition === "service_request") navigate(`/fleet-os/requests?request=${requestId}`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to process email");
    } finally {
      setWorking(false);
    }
  };
  const sendReply = async () => {
    if (!selected || !reply.trim()) return;
    setWorking(true);
    try {
      await replyToFleetEmail(selected.id, reply.trim());
      setReply("");
      toast.success("Reply sent");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Reply failed");
    } finally {
      setWorking(false);
    }
  };

  const mailboxItems: Array<{ id: MailboxView; label: string; icon: typeof Inbox; count?: number }> = [
    { id: "inbox", label: "Inbox", icon: Inbox, count: unreadCount },
    { id: "unread", label: "Unread", icon: Mail, count: unreadCount },
    { id: "sent", label: "Sent", icon: Send },
  ];

  return <FleetOSLayout title="Fleet Inbox">
    <div className="flex min-h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-xl border bg-background shadow-sm">
      <header className="flex min-h-16 flex-wrap items-center gap-3 border-b bg-card px-4 py-3 lg:px-5">
        <div className="min-w-[180px]">
          <h1 className="text-xl font-semibold tracking-tight">Fleet Inbox</h1>
          <p className="text-xs text-muted-foreground">Your connected business mailbox</p>
        </div>
        <div className="relative order-3 w-full flex-1 sm:order-none sm:min-w-[240px] sm:max-w-xl">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search sender, subject, or message" className="h-10 rounded-md bg-muted/50 pl-9" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-1.5 text-xs text-muted-foreground md:flex">
            <span className={`h-2 w-2 rounded-md ${configuration?.imap_configured ? "bg-emerald-500" : "bg-amber-500"}`} />
            {configuration?.imap_configured ? "Connected" : "Setup needed"}
          </div>
          <Button variant="ghost" size="icon" onClick={sync} disabled={working || !configuration?.imap_configured} aria-label="Sync inbox">
            {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => navigate("/settings?tab=comms#email-settings")} aria-label="Email settings"><Settings className="h-4 w-4" /></Button>
        </div>
      </header>

      {notConfigured && <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-amber-50 px-4 py-3 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
        <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="text-sm font-medium">Connect your mailbox</p><p className="text-xs opacity-80">Add SMTP and IMAP to send and receive Fleet email.</p></div></div>
        <Button size="sm" variant="outline" onClick={() => navigate("/settings?tab=comms#email-settings")}>Open email settings</Button>
      </div>}

      <div className="grid min-h-0 flex-1 md:grid-cols-[180px_320px_minmax(0,1fr)] xl:grid-cols-[210px_380px_minmax(0,1fr)]">
        <aside className="hidden border-r bg-muted/20 p-3 md:flex md:flex-col">
          <nav className="space-y-1" aria-label="Mailboxes">
            {mailboxItems.map(({ id, label, icon: Icon, count }) => <button key={id} onClick={() => { setMailboxView(id); setSelectedId(null); setMobileReaderOpen(false); }} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${mailboxView === id ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
              <Icon className="h-4 w-4" /><span>{label}</span>{Boolean(count) && <span className="ml-auto rounded-md bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">{count}</span>}
            </button>)}
          </nav>
          <div className="mt-auto border-t pt-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">{configuration?.smtp_configured ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}Outgoing mail</div>
            <p className="mt-2 leading-relaxed">{configuration?.imap_last_error ? <span className="text-destructive">Sync issue: {configuration.imap_last_error}</span> : configuration?.imap_last_synced_at ? `Synced ${new Date(configuration.imap_last_synced_at).toLocaleString()}` : "Not synced yet"}</p>
          </div>
        </aside>

        <section className={`${mobileReaderOpen ? "hidden md:flex" : "flex"} min-h-0 flex-col border-r bg-card`}>
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div><h2 className="font-semibold">{mailboxItems.find((item) => item.id === mailboxView)?.label}</h2><p className="text-xs text-muted-foreground">{filteredThreads.length} conversation{filteredThreads.length === 1 ? "" : "s"}</p></div>
            <div className="flex rounded-lg bg-muted p-1 md:hidden">
              {mailboxItems.map(({ id, label }) => <button key={id} onClick={() => setMailboxView(id)} className={`rounded-md px-2 py-1 text-xs ${mailboxView === id ? "bg-background font-medium shadow-sm" : "text-muted-foreground"}`}>{label}</button>)}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? <Loader2 className="mx-auto mt-10 h-5 w-5 animate-spin" /> : filteredThreads.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground"><Mail className="mx-auto mb-3 h-8 w-8" /><p className="font-medium text-foreground">No conversations here</p><p className="mt-1">{search ? "Try a different search." : "New messages will appear here."}</p></div> : filteredThreads.map((message) => {
              const active = selected?.thread_key === message.thread_key;
              return <button key={message.id} onClick={() => select(message)} className={`group relative block w-full border-b px-4 py-3 text-left transition-colors hover:bg-muted/60 ${active ? "bg-muted" : "bg-card"} ${!message.is_read ? "border-l-4 border-l-primary" : "border-l-4 border-l-transparent"}`}>
                <div className="mb-1 flex items-start justify-between gap-3"><span className={`truncate text-sm ${!message.is_read ? "font-semibold" : "font-medium"}`}>{message.direction === "outbound" ? `To: ${message.to_emails.join(", ")}` : message.from_name || message.from_email}</span><span className={`shrink-0 text-[11px] ${!message.is_read ? "font-medium text-primary" : "text-muted-foreground"}`}>{formatMessageTime(message.received_at)}</span></div>
                <p className={`truncate text-sm ${!message.is_read ? "font-semibold" : ""}`}>{message.subject || "(No subject)"}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{message.body_text}</p>
              </button>;
            })}
          </div>
        </section>

        <main className={`${mobileReaderOpen ? "flex" : "hidden md:flex"} min-h-0 min-w-0 flex-col bg-background`}>
          {!selected ? <div className="m-auto max-w-sm px-6 text-center text-muted-foreground"><Mail className="mx-auto mb-3 h-10 w-10 opacity-40" /><p className="font-medium text-foreground">Select a conversation</p><p className="mt-1 text-sm">Choose a message from the list to read and respond.</p></div> : <>
            <div className="border-b bg-card px-4 py-3 lg:px-5">
              <button onClick={() => setMobileReaderOpen(false)} className="mb-2 inline-flex items-center text-sm text-muted-foreground md:hidden"><ChevronLeft className="mr-1 h-4 w-4" />Back to inbox</button>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0"><h2 className="truncate text-lg font-semibold">{selected.subject || "(No subject)"}</h2><p className="mt-0.5 truncate text-xs text-muted-foreground">{selected.direction === "outbound" ? `To ${selected.to_emails.join(", ")}` : `From ${selected.from_name || selected.from_email} <${selected.from_email}>`}</p></div>
                <div className="flex flex-wrap gap-2"><Button size="sm" disabled={working || selected.direction !== "inbound"} onClick={() => handleRequestDisposition("service_request")}>Create service request</Button><Button size="sm" variant="outline" disabled={working || selected.direction !== "inbound"} onClick={() => handleRequestDisposition("non_service")}>Close as non-service</Button></div>
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 lg:px-6">
              {conversation.map((message) => <article key={message.id} className="mx-auto max-w-3xl rounded-lg border bg-card shadow-sm">
                <header className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3"><div><p className="text-sm font-semibold">{message.direction === "outbound" ? "You" : message.from_name || message.from_email}</p><p className="text-xs text-muted-foreground">{message.direction === "outbound" ? `To ${message.to_emails.join(", ")}` : message.from_email}</p></div><time className="text-xs text-muted-foreground">{new Date(message.received_at).toLocaleString()}</time></header>
                <div className="whitespace-pre-wrap px-4 py-5 text-sm leading-6 text-foreground">{message.body_text}</div>
              </article>)}
            </div>
            <div className="border-t bg-card p-4 lg:px-6">
              <div className="mx-auto max-w-3xl rounded-lg border bg-background p-3 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20">
                <Textarea autoComplete="off" value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Write a reply…" rows={3} className="resize-none border-0 bg-transparent p-1 shadow-none focus-visible:ring-0" />
                <div className="mt-2 flex justify-end"><Button onClick={sendReply} disabled={working || !reply.trim() || !configuration?.smtp_configured}><Reply className="mr-2 h-4 w-4" />Send reply</Button></div>
              </div>
            </div>
          </>}
        </main>
      </div>
    </div>
  </FleetOSLayout>;
}

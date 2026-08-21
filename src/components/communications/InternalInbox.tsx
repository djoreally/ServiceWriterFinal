/**
 * InternalInbox — staff-only messaging inbox.
 * Left: conversation list (DMs + job threads). Right: thread + composer.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Loader2, Send, Briefcase, MessageCircle, Plus, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  listInternalThreads,
  fetchInternalThreadMessages,
  markThreadRead,
  sendInternalMessage,
  listDmCandidates,
  ensureDirectThread,
  fetchInternalInboxCurrentUserId,
  subscribeInternalInboxMessages,
  type InternalThreadSummary,
  type InternalThreadMessage,
} from "@/application/queries/internal-inbox.query";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

interface InternalInboxProps {
  /** Pre-select a job thread by appointment id. */
  initialAppointmentId?: string;
  /** Embedded mode = no Card chrome, used inside Appointment Detail. */
  embedded?: boolean;
}

export function InternalInbox({ initialAppointmentId, embedded = false }: InternalInboxProps) {
  const [threads, setThreads] = useState<InternalThreadSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<InternalThreadMessage[]>([]);
  const [filter, setFilter] = useState("");
  const [tab, setTab] = useState<"all" | "job" | "direct">("all");
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [me, setMe] = useState<string | null>(null);
  const [showNewDm, setShowNewDm] = useState(false);
  const [candidates, setCandidates] = useState<Array<{ user_id: string; name: string; role: string }>>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Resolve current user id once
  useEffect(() => {
    fetchInternalInboxCurrentUserId().then((uid) => setMe(uid));
  }, []);


  const refreshThreads = useCallback(async (preferActive?: string | null) => {
    setLoadingThreads(true);
    try {
      const data = await listInternalThreads();
      setThreads(data);
      // Pre-select by appointmentId if requested and not yet selected
      if (initialAppointmentId && !activeId) {
        const match = data.find((t) => t.appointment_id === initialAppointmentId);
        if (match) {
          setActiveId(match.id);
          return;
        }
      }
      if (preferActive && data.some((t) => t.id === preferActive)) {
        setActiveId(preferActive);
      } else if (!activeId && data.length > 0) {
        setActiveId(data[0].id);
      }
    } catch (e) {
      console.error("[InternalInbox] thread load failed", e);
      toast.error("Couldn't load conversations");
    } finally {
      setLoadingThreads(false);
    }
  }, [initialAppointmentId, activeId]);

  useEffect(() => {
    refreshThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime: refresh threads + messages on any new message
  useEffect(() => {
    const sub = subscribeInternalInboxMessages((newRow) => {
      // Update thread list ordering/preview
      refreshThreads(activeId);
      if (activeId && newRow.thread_id === activeId) {
        setMessages((prev) =>
          prev.some((m) => m.id === newRow.id)
            ? prev
            : [
                ...prev,
                {
                  id: newRow.id,
                  thread_id: newRow.thread_id,
                  sender_id: newRow.sender_id,
                  sender_role: newRow.sender_role,
                  content: newRow.content,
                  attachments: Array.isArray(newRow.attachments) ? (newRow.attachments as string[]) : [],
                  created_at: newRow.created_at,
                  edited_at: newRow.edited_at,
                },
              ],
        );
      }
    });
    return () => {
      sub.unsubscribe();
    };
  }, [activeId, refreshThreads]);


  // Load messages whenever thread changes
  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    setLoadingMessages(true);
    fetchInternalThreadMessages(activeId)
      .then((m) => setMessages(m))
      .catch((e) => {
        console.error(e);
        toast.error("Failed to load messages");
      })
      .finally(() => setLoadingMessages(false));
    markThreadRead(activeId).catch(() => {});
  }, [activeId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const filteredThreads = useMemo(() => {
    return threads
      .filter((t) => (tab === "all" ? true : t.type === tab))
      .filter((t) => {
        if (!filter.trim()) return true;
        const q = filter.toLowerCase();
        return (
          t.title.toLowerCase().includes(q) ||
          (t.subtitle?.toLowerCase().includes(q) ?? false) ||
          (t.last_message_preview?.toLowerCase().includes(q) ?? false)
        );
      });
  }, [threads, filter, tab]);

  const activeThread = threads.find((t) => t.id === activeId) ?? null;

  const handleSend = async () => {
    if (!activeId || !draft.trim()) return;
    setSending(true);
    try {
      await sendInternalMessage({ threadId: activeId, content: draft.trim() });
      setDraft("");
      // optimistic refresh of messages happens via realtime; force fetch as fallback
      const fresh = await fetchInternalThreadMessages(activeId);
      setMessages(fresh);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const openNewDm = async () => {
    setShowNewDm(true);
    if (candidates.length === 0) {
      try {
        const list = await listDmCandidates();
        setCandidates(list);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const startDm = async (userId: string) => {
    try {
      const id = await ensureDirectThread(userId);
      setShowNewDm(false);
      await refreshThreads(id);
      setActiveId(id);
    } catch (e: any) {
      toast.error(e?.message || "Couldn't start direct message");
    }
  };

  const Container: React.FC<{ children: React.ReactNode }> = ({ children }) =>
    embedded ? <div className="h-full">{children}</div> : <Card className="h-[calc(100vh-10rem)]"><CardContent className="p-0 h-full">{children}</CardContent></Card>;

  return (
    <Container>
      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] h-full divide-x">
        {/* LEFT — conversation list */}
        <div className="flex flex-col min-h-0">
          <div className="p-3 border-b space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-7 h-9"
                  placeholder="Search conversations"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>
              <Dialog open={showNewDm} onOpenChange={setShowNewDm}>
                <DialogTrigger asChild>
                  <Button size="icon" variant="outline" className="h-9 w-9" onClick={openNewDm}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>New direct message</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-1 max-h-80 overflow-y-auto">
                    {candidates.length === 0 ? (
                      <p className="text-sm text-muted-foreground p-2">No teammates available yet. Invite staff from Settings → Team.</p>
                    ) : (
                      candidates.map((c) => (
                        <button
                          key={c.user_id}
                          onClick={() => startDm(c.user_id)}
                          className="w-full flex items-center justify-between p-2 rounded-md hover:bg-muted text-left"
                        >
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">{c.name}</span>
                          </div>
                          <Badge variant="outline" className="capitalize text-[10px]">{c.role}</Badge>
                        </button>
                      ))
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            <div className="flex gap-1 text-xs">
              {(["all", "job", "direct"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "px-2 py-1 rounded-md capitalize",
                    tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {t === "all" ? "All" : t === "job" ? "Jobs" : "Direct"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingThreads ? (
              <div className="p-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : filteredThreads.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground text-center">
                No conversations yet.
              </div>
            ) : (
              filteredThreads.map((t) => {
                const isActive = t.id === activeId;
                const Icon = t.type === "job" ? Briefcase : MessageCircle;
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveId(t.id)}
                    className={cn(
                      "w-full text-left p-3 border-b hover:bg-muted/50 transition-colors flex gap-3",
                      isActive && "bg-muted",
                    )}
                  >
                    <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm truncate">{t.title}</span>
                        {t.unread_count > 0 && (
                          <Badge className="h-5 min-w-5 px-1.5 text-[10px]">{t.unread_count}</Badge>
                        )}
                      </div>
                      {t.subtitle && <div className="text-[11px] text-muted-foreground truncate">{t.subtitle}</div>}
                      {t.last_message_preview && (
                        <div className="text-xs text-muted-foreground truncate mt-0.5">{t.last_message_preview}</div>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT — thread */}
        <div className="flex flex-col min-h-0">
          {!activeThread ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              Select a conversation to start
            </div>
          ) : (
            <>
              <div className="p-3 border-b">
                <div className="flex items-center gap-2">
                  {activeThread.type === "job" ? <Briefcase className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
                  <h3 className="font-semibold text-sm">{activeThread.title}</h3>
                  <Badge variant="outline" className="text-[10px] capitalize">{activeThread.type}</Badge>
                </div>
                {activeThread.subtitle && (
                  <p className="text-xs text-muted-foreground mt-0.5">{activeThread.subtitle}</p>
                )}
                {activeThread.participants.length > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {activeThread.participants.map((p) => p.name || "Staff").join(" · ")}
                  </p>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {loadingMessages ? (
                  <div className="flex justify-center pt-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : messages.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground pt-8">No messages yet. Send the first one.</p>
                ) : (
                  messages.map((m) => {
                    const mine = m.sender_id === me;
                    return (
                      <div key={m.id} className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}>
                        <div
                          className={cn(
                            "max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words",
                            mine ? "bg-primary text-primary-foreground" : "bg-muted",
                          )}
                        >
                          {m.content}
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          <span className="capitalize">{m.sender_role}</span> · {formatTime(m.created_at)}
                        </span>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-3 border-t flex gap-2">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Message your team…"
                  className="min-h-[44px] resize-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                />
                <Button onClick={handleSend} disabled={sending || !draft.trim()} className="self-end">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </Container>
  );
}

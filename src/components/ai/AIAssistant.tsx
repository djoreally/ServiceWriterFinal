import { SUPABASE_URL_RESOLVED } from "@/integrations/supabase/client";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Bot, Send, X, Loader2, Sparkles, CheckCircle, AlertCircle, Camera, Mic, MicOff, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSessionToken, transcribeAudio as invokeTranscribeAudio } from "@/application/queries/ai-session.query";
import { toast } from "@/components/ui/sonner";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuth } from "@packages/auth";
import { fetchActiveAiAgents } from "@/application/queries/ai-session.query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generateCorrelationId } from "@/lib/client-observability";

interface Message {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

interface ToolCall {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
}

interface ToolResult {
  toolCallId: string;
  success: boolean;
  message: string;
  imageUrl?: string;
  data?: unknown;
}

interface ActionResponse {
  success?: boolean;
  error?: string;
  result?: {
    message?: string;
    image_url?: string;
    [key: string]: unknown;
  };
}

declare global {
  interface Window {
    __aiAssistantPendingImage?: string;
  }
}

const CHAT_URL = `${SUPABASE_URL_RESOLVED}/functions/v1/ai-assistant`;

export function AIAssistant() {
  const { session } = useAuth();
  const isAuthenticated = !!session;
  
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingToolCalls, setPendingToolCalls] = useState<ToolCall[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [agentSlug, setAgentSlug] = useState<string>("sarah");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingHistoryRef = useRef<unknown[]>([]);
  const queryClient = useQueryClient();

  const { data: agents = [] } = useQuery({
    queryKey: ["ai-agents"],
    // Agent metadata is not startup-critical; defer it until the assistant is opened.
    enabled: isAuthenticated && isOpen,
    staleTime: 30 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      return await fetchActiveAiAgents();
    },

  });

  const activeAgent = agents.find((a) => a.slug === agentSlug) ?? agents[0];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, pendingToolCalls]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, pendingToolCalls]);

  const isReadOnlyTool = (name: string) =>
    name.startsWith("search_") || name.startsWith("get_") || name.startsWith("list_");

  const executeToolCall = async (toolCall: ToolCall, opts?: { silent?: boolean }): Promise<ToolResult> => {
    const token = await getSessionToken();
    if (!token) {
      return { toolCallId: toolCall.id, success: false, message: "Not authenticated" };
    }

    try {
      // Tool arguments arrive as a JSON string. Parameterless tools send "" — guard against
      // "Unexpected end of JSON input" by defaulting to an empty object.
      const rawArgs = (toolCall.function.arguments ?? "").trim();
      let args: Record<string, unknown> = {};
      if (rawArgs) {
        try {
          args = JSON.parse(rawArgs);
        } catch {
          args = {};
        }
      }

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          executeAction: {
            name: toolCall.function.name,
            arguments: args
          }
        }),
      });

      const text = await resp.text();
      let result: ActionResponse = {};
      if (text) {
        try {
          result = JSON.parse(text) as ActionResponse;
        } catch {
          result = { success: false, error: `Invalid response from server (${resp.status})` };
        }
      } else {
        result = { success: false, error: `Empty response from server (${resp.status})` };
      }

      if (result.success) {
        // Invalidate relevant queries to refresh data (only for mutations)
        if (!opts?.silent) {
          queryClient.invalidateQueries({ queryKey: ['customers'] });
          queryClient.invalidateQueries({ queryKey: ['vehicles'] });
          queryClient.invalidateQueries({ queryKey: ['appointments'] });
          queryClient.invalidateQueries({ queryKey: ['inventory'] });
          queryClient.invalidateQueries({ queryKey: ['services'] });
          queryClient.invalidateQueries({ queryKey: ['quotes'] });
          queryClient.invalidateQueries({ queryKey: ['service-catalog'] });
          queryClient.invalidateQueries({ queryKey: ['coupons'] });
          queryClient.invalidateQueries({ queryKey: ['reminders'] });
          toast.success(result.result?.message ?? "Done");
        }
        return {
          toolCallId: toolCall.id,
          success: true,
          message: result.result?.message ?? "Done",
          imageUrl: result.result?.image_url,
          data: result.result,
        };
      } else {
        if (!opts?.silent) toast.error(result.error || "Action failed");
        return { toolCallId: toolCall.id, success: false, message: result.error || "Action failed" };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      if (!opts?.silent) toast.error(errorMsg);
      return { toolCallId: toolCall.id, success: false, message: errorMsg };
    }
  };

  const buildToolMessages = (results: ToolResult[]) =>
    results.map(r => ({
      role: "tool" as const,
      tool_call_id: r.toolCallId,
      content: JSON.stringify(
        r.success
          ? (r.data ?? { success: true, message: r.message, imageUrl: r.imageUrl })
          : { success: false, error: r.message }
      ),
    }));

  const handleToolCallsConfirm = async () => {
    setIsLoading(true);
    const toolCallsSnapshot = pendingToolCalls;
    const results: ToolResult[] = [];

    for (const toolCall of toolCallsSnapshot) {
      results.push(await executeToolCall(toolCall));
    }

    // Attach results to the assistant message that requested them
    setMessages(prev => {
      const updated = [...prev];
      const lastIdx = updated.length - 1;
      if (updated[lastIdx]) updated[lastIdx] = { ...updated[lastIdx], toolResults: results };
      return updated;
    });

    setPendingToolCalls([]);

    // Feed tool results back to the model so it can produce a natural response
    try {
      await runTurn([...pendingHistoryRef.current, ...buildToolMessages(results)], 1);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown error";
      setMessages(prev => [...prev, { role: "assistant", content: `Sorry, I encountered an error: ${detail}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToolCallsCancel = () => {
    setPendingToolCalls([]);
    pendingHistoryRef.current = [];
    setMessages(prev => [
      ...prev,
      { role: "assistant", content: "Action cancelled. Is there anything else I can help you with?" }
    ]);
  };

  /**
   * One model turn. Streams text into a fresh assistant message and, when the
   * model asks for tools, executes read-only lookups and RE-ENTERS the loop so
   * multi-step chains (e.g. daily briefing → schedule lookup → summary) still
   * end with a written answer instead of a bare "Done".
   */
  const MAX_TOOL_ROUNDS = 5;

  const runTurn = async (history: unknown[], depth = 0): Promise<void> => {
    const token = await getSessionToken();
    if (!token) throw new Error("Not authenticated");

    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ messages: history, agentSlug }),
    });

    if (!resp.ok || !resp.body) {
      let serverError = `Server error (${resp.status})`;
      try {
        const errText = await resp.text();
        if (errText) {
          try {
            const errBody = JSON.parse(errText);
            serverError = errBody?.error || errText || serverError;
          } catch {
            serverError = errText;
          }
        }
      } catch { /* ignore */ }
      throw new Error(serverError);
    }

    // Fresh assistant message for this turn
    setMessages(prev => [...prev, { role: "assistant", content: "" }]);

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let textBuffer = "";
    const assistantChunks: string[] = [];
    const toolCalls: ToolCall[] = [];
    let streamDone = false;

    while (!streamDone) {
      const { done, value } = await reader.read();
      if (done) break;
      textBuffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
        let line = textBuffer.slice(0, newlineIndex);
        textBuffer = textBuffer.slice(newlineIndex + 1);

        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line.startsWith(":") || line.trim() === "") continue;
        if (!line.startsWith("data: ")) continue;

        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") {
          streamDone = true;
          break;
        }

        try {
          const parsed = JSON.parse(jsonStr);
          const choice = parsed.choices?.[0];

          const content = choice?.delta?.content as string | undefined;
          if (content) {
            assistantChunks.push(content);
            const assistantContent = assistantChunks.join("");
            setMessages(prev => prev.map((m, i) =>
              i === prev.length - 1 ? { ...m, content: assistantContent } : m
            ));
          }

          const deltaToolCalls = choice?.delta?.tool_calls;
          if (deltaToolCalls && Array.isArray(deltaToolCalls)) {
            for (const tc of deltaToolCalls) {
              // Gemini/OpenAI stream partial tool calls keyed by index; id only
              // arrives on the first fragment.
              const idx = typeof tc.index === "number" ? tc.index : toolCalls.length;
              if (!toolCalls[idx]) {
                toolCalls[idx] = {
                  id: tc.id || generateCorrelationId(`call_${idx}`),
                  function: { name: tc.function?.name || "", arguments: tc.function?.arguments || "" },
                };
              } else {
                if (tc.id) toolCalls[idx].id = tc.id;
                if (tc.function?.name) toolCalls[idx].function.name = tc.function.name;
                if (tc.function?.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
              }
            }
          }
        } catch {
          textBuffer = line + "\n" + textBuffer;
          break;
        }
      }
    }

    const assistantContent = assistantChunks.join("");
    const requestedTools = toolCalls.filter(Boolean);

    if (requestedTools.length === 0) {
      if (!assistantContent.trim()) {
        setMessages(prev => prev.map((m, i) =>
          i === prev.length - 1
            ? { ...m, content: "I couldn't put that into words — try asking again." }
            : m
        ));
      }
      return;
    }

    setMessages(prev => prev.map((m, i) =>
      i === prev.length - 1 ? { ...m, toolCalls: requestedTools } : m
    ));

    const assistantToolMsg = {
      role: "assistant" as const,
      content: assistantContent,
      tool_calls: requestedTools.map(tc => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.function.name, arguments: tc.function.arguments || "{}" },
      })),
    };
    const nextHistory = [...history, assistantToolMsg];

    const allReadOnly = requestedTools.every(tc => isReadOnlyTool(tc.function.name));

    if (allReadOnly && depth < MAX_TOOL_ROUNDS) {
      const results: ToolResult[] = [];
      for (const tc of requestedTools) {
        results.push(await executeToolCall(tc, { silent: true }));
      }
      setMessages(prev => prev.map((m, i) =>
        i === prev.length - 1 ? { ...m, toolResults: results } : m
      ));
      await runTurn([...nextHistory, ...buildToolMessages(results)], depth + 1);
      return;
    }

    // Mutating tools (or round limit hit) require explicit user confirmation
    pendingHistoryRef.current = nextHistory;
    setPendingToolCalls(requestedTools);
  };

  const streamChat = async (userMessages: Message[], pendingImageBase64?: string | null) => {
    const history = userMessages.map((m, idx) => {
      // ⚡ Multimodal: attach pending image as vision content on the last user message
      if (pendingImageBase64 && m.role === "user" && idx === userMessages.length - 1) {
        return {
          role: m.role,
          content: [
            { type: "image_url" as const, image_url: { url: `data:image/jpeg;base64,${pendingImageBase64}` } },
            { type: "text" as const, text: m.content },
          ],
        };
      }
      return { role: m.role, content: m.content };
    });

    await runTurn(history, 0);
  };


  // ── Voice recording ──

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await transcribeAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      toast.error("Microphone access denied");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const transcribeAudio = async (blob: Blob) => {
    setIsLoading(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const transcriptData = await invokeTranscribeAudio(base64, "audio/webm");
      const transcript = transcriptData?.text || transcriptData?.transcript || "";
      if (transcript) {
        setInput((prev) => (prev ? prev + " " + transcript : transcript));
        toast.success("Voice transcribed");
      } else {
        toast.error("Could not transcribe audio");
      }
    } catch (err) {
      console.error("Transcription error:", err);
      toast.error("Failed to transcribe voice");
    } finally {
      setIsLoading(false);
    }
  };

  // ── Camera / photo ──

  const handleCameraClick = () => {
    fileInputRef.current?.click();
  };

  const handleImageCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // ⚡ Validate file size (max 10MB for vision API)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image too large. Max size is 10MB.");
      e.target.value = "";
      return;
    }

    // Show preview
    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);

    // Convert to base64 for the multimodal AI gateway
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(",")[1];
      // Store base64 for vision API — sent with next message
      window.__aiAssistantPendingImage = base64;
      // Add a hint in the input if empty
      if (!input.trim()) {
        setInput("Scan this photo and extract all the data you can find.");
      }
    };
    reader.readAsDataURL(file);

    // Reset file input so same file can be selected again
    e.target.value = "";
  };

  const clearImagePreview = () => {
    setImagePreview(null);
    delete window.__aiAssistantPendingImage;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading || pendingToolCalls.length > 0) return;

    // ⚡ Grab pending image before clearing
    const pendingImage = window.__aiAssistantPendingImage ?? null;

    const userMessage: Message = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    clearImagePreview();
    setIsLoading(true);

    try {
      await streamChat(newMessages, pendingImage);
    } catch (error) {
      console.error("Chat error:", error);
      const errorDetail = error instanceof Error ? error.message : "Unknown error";
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: `Sorry, I encountered an error: ${errorDetail}` }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setPendingToolCalls([]);
  };

  const formatToolName = (name: string) => {
    return name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  };

  const formatToolArguments = (argsStr: string) => {
    try {
      const args = JSON.parse(argsStr);
      return Object.entries(args)
        .filter(([_, v]) => v !== null && v !== undefined && v !== "")
        .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
        .join(", ");
    } catch {
      return argsStr;
    }
  };

  // Only show for authenticated users
  if (!isAuthenticated) {
    return null;
  }

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          size="icon"
          className="fixed bottom-[calc(4rem+1rem+env(safe-area-inset-bottom))] right-4 lg:bottom-6 lg:right-6 h-14 w-14 rounded-md shadow-lg bg-primary hover:bg-primary/90 z-50"
        >
          <Bot className="h-6 w-6" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="px-4 py-3 border-b space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="h-8 w-8 rounded-md flex items-center justify-center text-base shrink-0"
                style={{ backgroundColor: activeAgent?.color ? `${activeAgent.color}1A` : undefined }}
              >
                <span aria-hidden>{activeAgent?.avatar ?? "🤖"}</span>
              </div>
              <div className="min-w-0">
                <SheetTitle className="text-base truncate">
                  {activeAgent?.name ?? "AI Copilot"}
                </SheetTitle>
                <p className="text-xs text-muted-foreground truncate">
                  {activeAgent?.role ?? "Assistant"}
                </p>
              </div>
            </div>
            {messages.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearChat}>
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>
          {agents.length > 1 && (
            <Select
              value={agentSlug}
              onValueChange={(v) => {
                setAgentSlug(v);
                setMessages([]);
                setPendingToolCalls([]);
              }}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Choose a copilot" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((a) => (
                  <SelectItem key={a.slug} value={a.slug}>
                    <span className="mr-2">{a.avatar ?? "🤖"}</span>
                    {a.name} <span className="text-muted-foreground">— {a.role}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </SheetHeader>


        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <div className="h-16 w-16 rounded-md bg-primary/10 flex items-center justify-center mb-4">
                <Bot className="h-8 w-8 text-primary" />
              </div>
              <h3 className="font-semibold text-lg mb-2">How can I help you?</h3>
              <p className="text-muted-foreground text-sm max-w-xs">
                Ask me anything or request actions like creating customers, scheduling appointments, or managing inventory.
              </p>
              <div className="mt-6 space-y-2 w-full max-w-xs">
                {[
                  "Book appointment: John Smith, 555-1234, 2020 Toyota Camry, oil change tomorrow at 10am",
                  "What's on my schedule today?",
                  "Which items are low in stock?",
                  "Create a quote for brake service",
                  "Add a new customer",
                ].map((suggestion) => (
                  <Button
                    key={suggestion}
                    variant="outline"
                    size="sm"
                    className="w-full text-left justify-start h-auto py-2 px-3 text-xs"
                    onClick={() => {
                      setInput(suggestion);
                      textareaRef.current?.focus();
                    }}
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message, index) => (
                <div key={index}>
                  <div
                    className={cn(
                      "flex",
                      message.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      )}
                    >
                      <div className="whitespace-pre-wrap">{message.content}</div>
                    </div>
                  </div>
                  
                  {/* Show tool calls */}
                  {message.toolCalls && message.toolCalls.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {message.toolCalls.map((tc) => {
                        const result = message.toolResults?.find(r => r.toolCallId === tc.id);
                        return (
                          <div key={tc.id} className="bg-muted/50 border rounded-lg p-3 text-sm">
                            <div className="flex items-center gap-2 font-medium">
                              {result ? (
                                result.success ? (
                                  <CheckCircle className="h-4 w-4 text-gray-500" />
                                ) : (
                                  <AlertCircle className="h-4 w-4 text-destructive" />
                                )
                              ) : (
                                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                              )}
                              {formatToolName(tc.function.name)}
                            </div>
                            <div className="mt-1 text-muted-foreground text-xs">
                              {formatToolArguments(tc.function.arguments)}
                            </div>
                            {result && (
                              <div className={cn(
                                "mt-2 text-xs",
                                result.success ? "text-gray-600" : "text-destructive"
                              )}>
                                {result.message}
                                {result.imageUrl && (
                                  <a
                                    href={result.imageUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block mt-2"
                                  >
                                    <img
                                      src={result.imageUrl}
                                      alt="Generated"
                                      className="rounded-lg border max-w-full h-auto"
                                    />
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
              
              {/* Pending tool calls confirmation */}
              {pendingToolCalls.length > 0 && !messages[messages.length - 1]?.toolResults && (
                <div className="bg-accent/50 border border-accent rounded-lg p-4">
                  <p className="text-sm font-medium mb-3">Confirm actions:</p>
                  <div className="space-y-2 mb-4">
                    {pendingToolCalls.map((tc) => (
                      <div key={tc.id} className="text-sm">
                        <span className="font-medium">{formatToolName(tc.function.name)}</span>
                        <span className="text-muted-foreground ml-2 text-xs">
                          {formatToolArguments(tc.function.arguments)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleToolCallsConfirm} disabled={isLoading}>
                      {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                      Confirm
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleToolCallsCancel} disabled={isLoading}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
              
              {isLoading && messages[messages.length - 1]?.role === "user" && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-3 py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        <form onSubmit={handleSubmit} className="p-4 border-t space-y-2">
          {/* Image preview */}
          {imagePreview && (
            <div className="relative inline-block">
              <img
                src={imagePreview}
                alt="Captured"
                className="h-16 w-16 object-cover rounded-lg border"
              />
              <button
                type="button"
                onClick={clearImagePreview}
                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-md bg-destructive text-destructive-foreground flex items-center justify-center text-xs"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          <div className="flex gap-2 items-end">
            {/* Camera button */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf"
              capture="environment"
              className="hidden"
              onChange={handleImageCapture}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-9 w-9 shrink-0"
              onClick={handleCameraClick}
              disabled={isLoading || pendingToolCalls.length > 0}
              title="Take photo or upload image"
            >
              <Camera className="h-4 w-4" />
            </Button>

            {/* Voice button */}
            <Button
              type="button"
              size="icon"
              variant={isRecording ? "destructive" : "ghost"}
              className={cn("h-9 w-9 shrink-0", isRecording && "animate-pulse")}
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isLoading && !isRecording}
              title={isRecording ? "Stop recording" : "Voice input"}
            >
              {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>

            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isRecording ? "Listening..." : "Ask or request an action..."}
              className="min-h-[44px] max-h-32 resize-none"
              rows={1}
              disabled={isLoading || pendingToolCalls.length > 0}
            />
            <Button type="submit" size="icon" className="shrink-0" disabled={!input.trim() || isLoading || pendingToolCalls.length > 0}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/**
 * VoiceBookingWidget — Embeddable voice agent for booking appointments.
 * Uses @elevenlabs/react useConversation hook for WebRTC audio.
 * Must be wrapped in ConversationProvider (v1 SDK requirement).
 */
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { useState, useCallback } from "react";
import { Mic, PhoneOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  invokeVoiceBookingTool,
  fetchVoiceConversationToken,
} from "@/application/commands/voice-agent.command";

import { toast } from "@/components/ui/sonner";

interface VoiceBookingWidgetProps {
  slug: string;
  businessName?: string;
}

function VoiceBookingWidgetInner({ slug, businessName }: VoiceBookingWidgetProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [shopName, setShopName] = useState(businessName ?? "");

  const conversation = useConversation({
    clientTools: {
      get_services: async () => {
        const res = await invokeVoiceBookingTool({ slug, tool: "get_services" });
        return JSON.stringify(res.data ?? { error: "Failed to fetch services" });
      },
      check_availability: async (params: { date: string }) => {
        const res = await invokeVoiceBookingTool({ slug, tool: "check_availability", params });
        return JSON.stringify(res.data ?? { error: "Failed to check availability" });
      },
      book_appointment: async (params: Record<string, unknown>) => {
        const res = await invokeVoiceBookingTool({ slug, tool: "book_appointment", params });
        if ((res.data as { success?: boolean } | null)?.success) {
          toast.success("Appointment booked successfully!");
        }
        return JSON.stringify(res.data ?? { error: "Failed to book appointment" });
      },
      create_service_request: async (params: Record<string, unknown>) => {
        const res = await invokeVoiceBookingTool({ slug, tool: "create_service_request", params });
        if ((res.data as { success?: boolean } | null)?.success) toast.success("Service request sent to dispatch");
        return JSON.stringify(res.data ?? { error: "Failed to save service request" });
      },
      get_shop_info: async () => {
        const res = await invokeVoiceBookingTool({ slug, tool: "get_shop_info" });
        return JSON.stringify(res.data ?? { error: "Failed to fetch shop info" });
      },
    },

    onError: () => {
      toast.error("Voice connection error. Please try again.");
    },
  });

  const startConversation = useCallback(async () => {
    setIsConnecting(true);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });

      const data = await fetchVoiceConversationToken(slug);
      if (!data?.token) {
        throw new Error(data?.error ?? "Failed to get voice token");
      }

      if (data.business_name) {
        setShopName(data.business_name);
      }

      await conversation.startSession({
        conversationToken: data.token,
        connectionType: "webrtc",
      });

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Connection failed";
      toast.error(msg);
    } finally {
      setIsConnecting(false);
    }
  }, [conversation, slug]);

  const stopConversation = useCallback(async () => {
    await conversation.endSession();
  }, [conversation]);

  const isConnected = conversation.status === "connected";

  return (
    <div className="flex flex-col items-center gap-4 p-6">
      {shopName && (
        <h3 className="text-lg font-semibold text-foreground">{shopName}</h3>
      )}

      <p className="text-sm text-muted-foreground text-center max-w-xs">
        {isConnected
          ? conversation.isSpeaking
            ? "Agent is speaking..."
            : "Listening — speak now"
          : "Tap the mic to start a voice booking"}
      </p>

      <Button
        size="lg"
        variant={isConnected ? "destructive" : "default"}
        className="h-20 w-20 rounded-md shadow-lg"
        onClick={isConnected ? stopConversation : startConversation}
        disabled={isConnecting}
      >
        {isConnecting ? (
          <Loader2 className="h-8 w-8 animate-spin" />
        ) : isConnected ? (
          <PhoneOff className="h-8 w-8" />
        ) : (
          <Mic className="h-8 w-8" />
        )}
      </Button>

      <div className="flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-md ${
            isConnected ? "bg-gray-500 animate-pulse" : "bg-muted-foreground"
          }`}
        />
        <span className="text-xs text-muted-foreground capitalize">
          {conversation.status}
        </span>
      </div>
    </div>
  );
}

export function VoiceBookingWidget(props: VoiceBookingWidgetProps) {
  return (
    <ConversationProvider>
      <VoiceBookingWidgetInner {...props} />
    </ConversationProvider>
  );
}

/**
 * VoiceAgentEmbed — Standalone page for iframe embedding.
 * Route: /voice-agent/:slug
 */
import { useParams } from "react-router-dom";
import { VoiceBookingWidget } from "@/components/voice-agent/VoiceBookingWidget";

const VoiceAgentEmbed = () => {
  const { slug } = useParams<{ slug: string }>();

  if (!slug) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <p className="text-muted-foreground">Invalid booking link.</p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <VoiceBookingWidget slug={slug} />
    </div>
  );
};

export default VoiceAgentEmbed;

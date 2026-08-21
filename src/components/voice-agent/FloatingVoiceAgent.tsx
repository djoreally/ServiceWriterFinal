/**
 * FloatingVoiceAgent — Floating voice-booking entry point shown on the
 * public booking site whenever the shop has an ElevenLabs agent configured.
 *
 * Uses the `public_has_voice_agent` RPC so the agent ID itself stays on the
 * server; we only learn whether the widget should appear.
 */
import { useEffect, useState } from "react";
import { Mic, X } from "lucide-react";
import { checkHasVoiceAgent } from "@/application/queries/voice-agent.query";
import { Button } from "@/components/ui/button";
import { VoiceBookingWidget } from "./VoiceBookingWidget";

interface Props {
  slug: string;
  businessName?: string;
}

export function FloatingVoiceAgent({ slug, businessName }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [appointmentSummaryOpen, setAppointmentSummaryOpen] = useState(false);

  useEffect(() => {
    let active = true;
    if (!slug) return;
    checkHasVoiceAgent(slug).then((has) => {
      if (!active) return;
      setEnabled(has);
    });
    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    const handleSummaryToggle = (event: Event) => {
      const summaryOpen = Boolean((event as CustomEvent<{ open?: boolean }>).detail?.open);
      setAppointmentSummaryOpen(summaryOpen);
      if (summaryOpen) setOpen(false);
    };
    window.addEventListener("appointment-summary-toggle", handleSummaryToggle);
    return () => window.removeEventListener("appointment-summary-toggle", handleSummaryToggle);
  }, []);


  if (!enabled) return null;

  return (
    <>
      {/* Launcher */}
      {!open && !appointmentSummaryOpen && (
        <Button
          size="lg"
          aria-label="Book by voice"
          onClick={() => setOpen(true)}
          className="fixed bottom-40 right-4 z-50 h-12 w-12 rounded-md shadow-xl sm:bottom-44 sm:right-6"
        >
          <Mic className="h-6 w-6" />
        </Button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-40 right-4 z-50 w-[22rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card shadow-2xl sm:bottom-44 sm:right-6">
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <span className="text-sm font-medium">Book by voice</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close voice booking"
              onClick={() => setOpen(false)}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <VoiceBookingWidget slug={slug} businessName={businessName} />
        </div>
      )}
    </>
  );
}

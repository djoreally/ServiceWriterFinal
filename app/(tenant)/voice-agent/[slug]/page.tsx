"use client";

import { Routes, Route } from "react-router-dom";
import { NextRouterAdapter } from "@/components/routing/NextRouterAdapter";
import VoiceAgentEmbed from "@/legacy-pages/VoiceAgentEmbed";

// SPA: <Route path="/voice-agent/:slug" element={<VoiceAgentEmbed />} />
// (rendered on both tenant and non-tenant hosts). The slug comes from
// react-router `useParams()` inside the component (the adapter's
// <Route path> is authoritative; the Next `[slug]` segment mirrors it).
// Public embed — no auth guard in the SPA.
export default function VoiceAgentEmbedPage() {
  return (
    <NextRouterAdapter>
      <Routes>
        <Route path="/voice-agent/:slug" element={<VoiceAgentEmbed />} />
      </Routes>
    </NextRouterAdapter>
  );
}

"use client";

import React from "react";
import App from "./App";
import { AuthProvider } from "@packages/auth";
import ErrorBoundary from "./shared/errors/ErrorBoundary";
import { ThemeProvider } from "./components/ThemeProvider";
import { GDPRConsentBanner } from "./components/security/GDPRConsentBanner";
import { supabase } from "./integrations/supabase/client";

/**
 * Client boundary for the consolidated Next.js application.
 * The preserved product UI remains client-rendered because it contains
 * browser auth, interactive scheduling, offline support, and map controls.
 */
export default function NextClientShell() {
  return (
    <React.StrictMode>
      <ErrorBoundary>
        <AuthProvider authStateSource={supabase.auth}>
          <ThemeProvider defaultTheme="light" storageKey="servicewriter-ui-theme">
            <App />
            <GDPRConsentBanner />
          </ThemeProvider>
        </AuthProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
}

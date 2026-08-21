/**
 * GDPR Consent Banner
 * Shown on first visit. Allows users to accept all or customize consent.
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { getConsent, acceptAllConsent, acceptNecessaryOnly } from '@/lib/security/gdpr';
import { Shield } from 'lucide-react';

export function GDPRConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = getConsent();
    if (!consent) {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const handleAcceptAll = () => {
    acceptAllConsent();
    setVisible(false);
  };

  const handleNecessaryOnly = () => {
    acceptNecessaryOnly();
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border shadow-lg p-4 md:p-6"
    >
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-start md:items-center gap-4">
        <Shield className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">Privacy & Cookie Settings</p>
          <p className="text-xs text-muted-foreground mt-1">
            We use cookies and similar technologies to operate our platform, analyze usage,
            and deliver relevant communications. Your data is processed in accordance with
            our Privacy Policy (GDPR/CCPA compliant).
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleNecessaryOnly}
            className="text-xs"
          >
            Necessary Only
          </Button>
          <Button
            size="sm"
            onClick={handleAcceptAll}
            className="text-xs"
          >
            Accept All
          </Button>
        </div>
      </div>
    </div>
  );
}

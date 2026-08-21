/**
 * Consent Preferences Dialog
 * Sprint 3 Story 3.3.2 - Granular Consent Management
 * 
 * Allows users to customize consent categories individually.
 * Essential category cannot be disabled (required for platform functionality).
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Shield, ExternalLink } from 'lucide-react';
import {
  type ConsentCategory,
  getConsentCategoryInfo,
  saveConsent,
  getConsent,
} from '@/lib/security/gdpr';

interface ConsentPreferencesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: () => void;
}

export function ConsentPreferencesDialog({
  open,
  onOpenChange,
  onSave,
}: ConsentPreferencesDialogProps) {
  const currentConsent = getConsent();
  const categories = getConsentCategoryInfo();
  
  const [preferences, setPreferences] = useState<Record<ConsentCategory, boolean>>(() => {
    if (currentConsent) {
      return currentConsent.categories;
    }
    // Default: only necessary enabled
    return {
      necessary: true,
      analytics: false,
      marketing: false,
      integrations: false,
    };
  });

  const handleToggle = (category: ConsentCategory) => {
    if (category === 'necessary') return; // Can't disable necessary
    setPreferences((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  const handleSave = () => {
    saveConsent(preferences);
    onSave?.();
    onOpenChange(false);
  };

  const handleAcceptAll = () => {
    const allEnabled = categories.reduce(
      (acc, cat) => ({ ...acc, [cat.id]: true }),
      {} as Record<ConsentCategory, boolean>
    );
    setPreferences(allEnabled);
    saveConsent(allEnabled);
    onSave?.();
    onOpenChange(false);
  };

  const handleNecessaryOnly = () => {
    const necessaryOnly = categories.reduce(
      (acc, cat) => ({ ...acc, [cat.id]: cat.required }),
      {} as Record<ConsentCategory, boolean>
    );
    setPreferences(necessaryOnly);
    saveConsent(necessaryOnly);
    onSave?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Privacy & Cookie Preferences
          </DialogTitle>
          <DialogDescription>
            Control how we collect and use your data. Essential cookies are required for the
            platform to work and cannot be disabled.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {categories.map((category) => (
            <div
              key={category.id}
              className="flex items-start gap-4 p-4 border rounded-lg hover:bg-accent/50 transition-colors"
            >
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor={category.id}
                    className="text-base font-semibold cursor-pointer"
                  >
                    {category.name}
                  </Label>
                  {category.required && (
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-md font-medium">
                      Required
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{category.description}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {category.examples.map((example) => (
                    <span
                      key={example}
                      className="text-xs bg-muted px-2 py-1 rounded-md text-muted-foreground"
                    >
                      {example}
                    </span>
                  ))}
                </div>
              </div>
              <Switch
                id={category.id}
                checked={preferences[category.id]}
                onCheckedChange={() => handleToggle(category.id)}
                disabled={category.required}
                className="mt-1"
              />
            </div>
          ))}
        </div>

        <div className="border-t pt-4">
          <a
            href="/privacy-policy.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline inline-flex items-center gap-1"
          >
            Read our Privacy Policy
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={handleNecessaryOnly} className="w-full sm:w-auto">
            Necessary Only
          </Button>
          <Button variant="outline" onClick={handleAcceptAll} className="w-full sm:w-auto">
            Accept All
          </Button>
          <Button onClick={handleSave} className="w-full sm:w-auto">
            Save Preferences
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

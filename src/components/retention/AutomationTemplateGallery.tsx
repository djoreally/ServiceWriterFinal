/**
 * AutomationTemplateGallery — quick-start automation cards.
 * One click seeds a complete rule (trigger + actions + cooldown).
 */
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Sparkles, Loader2, Check, RotateCcw } from "lucide-react";
import { AUTOMATION_TEMPLATES, type AutomationTemplate } from "@/lib/retention/automation-templates";
import { seedAllDefaults, seedAutomationTemplate } from "@/application/commands/automation-template.command";
import { toast } from "sonner";

interface AutomationTemplateGalleryProps {
  userId: string;
  existingRuleNames: string[];
  collapsed?: boolean;
  onSeeded: () => void;
}

const categoryColor: Record<AutomationTemplate["category"], string> = {
  winback: "bg-violet-500/10 text-violet-600 border-violet-500/20",
  reminder: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  review: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  loyalty: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  recovery: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  celebration: "bg-pink-500/10 text-pink-600 border-pink-500/20",
};

export function AutomationTemplateGallery({
  userId,
  existingRuleNames,
  collapsed = false,
  onSeeded,
}: AutomationTemplateGalleryProps) {
  const [seedingId, setSeedingId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [open, setOpen] = useState(!collapsed);

  const handleSeed = async (template: AutomationTemplate) => {
    if (existingRuleNames.includes(template.name)) {
      const ok = window.confirm(
        `An automation named "${template.name}" already exists. Create another copy?`,
      );
      if (!ok) return;
    }
    setSeedingId(template.id);
    try {
      const res = await seedAutomationTemplate(userId, template.id);
      toast.success(`${res.ruleName} created — ${template.actions.length} action(s)`);
      onSeeded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to seed automation");
    } finally {
      setSeedingId(null);
    }
  };

  const handleRestoreDefaults = async () => {
    setRestoring(true);
    try {
      const result = await seedAllDefaults(userId);
      toast.success(
        result.automationRulesInserted || result.customerSegmentsInserted
          ? `Defaults restored: ${result.automationRulesInserted} rule(s), ${result.customerSegmentsInserted} segment(s)`
          : "Defaults already restored",
      );
      onSeeded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to restore defaults");
    } finally {
      setRestoring(false);
    }
  };

  const grid = (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {AUTOMATION_TEMPLATES.map((t) => {
        const exists = existingRuleNames.includes(t.name);
        const isSeeding = seedingId === t.id;
        return (
          <Card key={t.id} className="overflow-hidden">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="text-2xl leading-none">{t.icon}</div>
                {exists && (
                  <Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-500/30">
                    <Check className="h-3 w-3" /> Active
                  </Badge>
                )}
              </div>
              <div>
                <p className="text-sm font-bold leading-tight">{t.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t.tagline}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="outline" className={`text-[10px] ${categoryColor[t.category]}`}>
                  {t.category}
                </Badge>
                <Badge variant="secondary" className="text-[10px] font-mono">
                  Priority {t.priority}
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  {t.actions.length} action{t.actions.length === 1 ? "" : "s"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Cooldown:{" "}
                {t.cooldownHours >= 24
                  ? `${Math.round(t.cooldownHours / 24)}d`
                  : `${t.cooldownHours}h`}
              </p>
              <Button
                size="sm"
                variant={exists ? "outline" : "default"}
                className="w-full gap-1.5"
                disabled={isSeeding || seedingId !== null}
                onClick={() => handleSeed(t)}
              >
                {isSeeding ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Seeding...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    {exists ? "Add another" : "Use this template"}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );

  if (!collapsed) {
    return (
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold tracking-tight flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              Quick-start Automations
            </h3>
            <p className="text-xs text-muted-foreground">
              Launch a working retention rule in one click — fully editable after.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleRestoreDefaults} disabled={restoring} className="gap-1.5">
            {restoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Restore Defaults
          </Button>
        </div>
        {grid}
      </div>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          {open ? "Hide templates" : "Add from template"}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3 space-y-3">
        <Button variant="outline" size="sm" onClick={handleRestoreDefaults} disabled={restoring} className="gap-1.5">
          {restoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
          Restore Defaults
        </Button>
        {grid}
      </CollapsibleContent>
    </Collapsible>
  );
}

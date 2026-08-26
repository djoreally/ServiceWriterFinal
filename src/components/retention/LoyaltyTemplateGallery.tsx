/**
 * LoyaltyTemplateGallery — 4 quick-start template cards.
 * Click "Use this template" to seed a program + rewards in one shot.
 */
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, Check } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { LOYALTY_TEMPLATES, type LoyaltyTemplate } from "@/lib/retention/loyalty-templates";
import { seedLoyaltyTemplate } from "@/application/commands/loyalty-template.command";
import { toast } from "@/components/ui/sonner";

interface LoyaltyTemplateGalleryProps {
  userId: string;
  /** Names of existing programs — used to warn before duplicate seeding */
  existingProgramNames: string[];
  /** Show as a collapsible "Add from template" trigger when programs already exist */
  collapsed?: boolean;
  onSeeded: () => void;
}

export function LoyaltyTemplateGallery({
  userId,
  existingProgramNames,
  collapsed = false,
  onSeeded,
}: LoyaltyTemplateGalleryProps) {
  const [seedingId, setSeedingId] = useState<string | null>(null);
  const [open, setOpen] = useState(!collapsed);

  const handleSeed = async (template: LoyaltyTemplate) => {
    if (existingProgramNames.includes(template.name)) {
      const ok = window.confirm(
        `A program named "${template.name}" already exists. Create another copy?`,
      );
      if (!ok) return;
    }
    setSeedingId(template.id);
    try {
      const res = await seedLoyaltyTemplate(userId, template.id);
      toast.success(`${template.name} created with ${res.rewardsInserted} rewards`);
      onSeeded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to seed template");
    } finally {
      setSeedingId(null);
    }
  };

  const grid = (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {LOYALTY_TEMPLATES.map((t) => {
        const exists = existingProgramNames.includes(t.name);
        const isSeeding = seedingId === t.id;
        return (
          <Card key={t.id} className="relative overflow-hidden">
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
              <div className="flex flex-wrap gap-1.5 text-[10px]">
                <Badge variant="secondary" className="font-mono">
                  {t.pointsPerDollar} pt/$1
                </Badge>
                {t.pointsPerVisit > 0 && (
                  <Badge variant="secondary" className="font-mono">
                    +{t.pointsPerVisit}/visit
                  </Badge>
                )}
                <Badge variant="outline" className="font-mono">
                  {t.scope.replace("_", " ")}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {t.rewards.length} reward{t.rewards.length === 1 ? "" : "s"}
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
        <div>
          <h3 className="text-sm font-bold tracking-tight flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            Quick-start Templates
          </h3>
          <p className="text-xs text-muted-foreground">
            Launch a working loyalty program in one click — fully editable after.
          </p>
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
      <CollapsibleContent className="pt-3">{grid}</CollapsibleContent>
    </Collapsible>
  );
}

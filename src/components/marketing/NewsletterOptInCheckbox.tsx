import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { subscribeToNewsletter } from "@/application/commands/marketing.command";

type Props = {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  id?: string;
  label?: string;
};

/**
 * Drop-in opt-in checkbox. Pair with `subscribeOnOptIn` after the parent form
 * (e.g. quote request) submits successfully.
 */
export function NewsletterOptInCheckbox({
  checked,
  onCheckedChange,
  id = "newsletter-opt-in",
  label = "Email me occasional tips and updates (you can unsubscribe anytime).",
}: Props) {
  return (
    <div className="flex items-start gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onCheckedChange(Boolean(v))} />
      <Label htmlFor={id} className="text-sm font-normal leading-snug">
        {label}
      </Label>
    </div>
  );
}

export async function subscribeOnOptIn(args: {
  workspaceUserId: string;
  email: string;
  name?: string;
  source: string;
  segment?: string;
  utm?: Record<string, string>;
}): Promise<void> {
  if (!args.email || !args.workspaceUserId) return;
  try {
    await subscribeToNewsletter(args);
  } catch {
    // Newsletter opt-in is best-effort; never block the parent form.
  }
}

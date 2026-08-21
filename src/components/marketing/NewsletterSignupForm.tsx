import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { subscribeToNewsletter } from "@/application/commands/marketing.command";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  name: z.string().trim().max(120).optional().or(z.literal("")),
});

type Props = {
  workspaceUserId: string;
  source?: string;
  segment?: string;
  showName?: boolean;
  className?: string;
  onSubscribed?: (info: { subscriberId: string; unsubscribeToken: string }) => void;
};

function readUtm(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const p = new URLSearchParams(window.location.search);
  const utm: Record<string, string> = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
    const v = p.get(k);
    if (v) utm[k] = v;
  }
  if (document.referrer) utm.referrer = document.referrer;
  return utm;
}

export function NewsletterSignupForm({
  workspaceUserId,
  source = "newsletter_form",
  segment = "general",
  showName = true,
  className,
  onSubscribed,
}: Props) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ email, name });
    if (!parsed.success) {
      toast({ title: "Check your details", description: parsed.error.issues[0].message, variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await subscribeToNewsletter({
        workspaceUserId,
        email: parsed.data.email,
        name: parsed.data.name || undefined,
        source,
        segment,
        utm: readUtm(),
      });
      if (error || !data?.ok) throw new Error(error?.message ?? data?.error ?? "Subscribe failed");
      setDone(true);
      onSubscribed?.({ subscriberId: data.subscriberId, unsubscribeToken: data.unsubscribeToken });
      toast({ title: "Subscribed", description: "You're on the list." });
    } catch (err) {
      toast({
        title: "Subscribe failed",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className={className}>Thanks — you're subscribed. Check your inbox for confirmation.</p>
    );
  }

  return (
    <form onSubmit={submit} className={className ?? "space-y-3"}>
      {showName && (
        <div>
          <Label htmlFor="nl-name">Name</Label>
          <Input id="nl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane" maxLength={120} />
        </div>
      )}
      <div>
        <Label htmlFor="nl-email">Email</Label>
        <Input
          id="nl-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          maxLength={255}
        />
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? "Subscribing…" : "Subscribe"}
      </Button>
      <p className="text-xs text-muted-foreground">
        By subscribing you consent to receive our newsletter. Unsubscribe anytime via the link in any email.
      </p>
    </form>
  );
}

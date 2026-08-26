import { useState } from "react";
import { Loader2, Tag } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { submitPublicQuoteRequest } from "@/application/queries/repair-pricing.query";

interface QuoteRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessUserId: string;
  businessName?: string;
  /** Where the request came from, for attribution. */
  source?: string;
  /** Prefill from an in-progress booking. */
  defaults?: {
    name?: string;
    email?: string;
    phone?: string;
    vin?: string;
    year?: number;
    make?: string;
    model?: string;
  };
}

const fmt = (n?: number | null) =>
  !n || n <= 0 ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

/**
 * Estimate-only funnel for visitors who want a price rather than a time slot.
 * Submits through the public-quote-request edge function so the shop receives
 * a lead and the visitor gets a market-anchored range.
 */
export function QuoteRequestDialog({
  open,
  onOpenChange,
  businessUserId,
  businessName,
  source = "public_booking",
  defaults,
}: QuoteRequestDialogProps) {
  const [name, setName] = useState(defaults?.name ?? "");
  const [email, setEmail] = useState(defaults?.email ?? "");
  const [phone, setPhone] = useState(defaults?.phone ?? "");
  const [vin, setVin] = useState(defaults?.vin ?? "");
  const [year, setYear] = useState(defaults?.year ? String(defaults.year) : "");
  const [make, setMake] = useState(defaults?.make ?? "");
  const [model, setModel] = useState(defaults?.model ?? "");
  const [repair, setRepair] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<
    { repairTitle: string | null; estimate: { low: number; avg: number; high: number } | null; shopPrice: number | null } | null
  >(null);

  const canSubmit = (!!email.trim() || !!phone.trim()) && !!repair.trim() && !submitting;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const { data, error } = await submitPublicQuoteRequest({
        businessUserId,
        guestName: name.trim() || undefined,
        guestEmail: email.trim() || undefined,
        guestPhone: phone.trim() || undefined,
        vin: vin.trim() || undefined,
        vehicleYear: year ? Number(year) : undefined,
        vehicleMake: make.trim() || undefined,
        vehicleModel: model.trim() || undefined,
        repairTitle: repair.trim(),
        notes: notes.trim() || undefined,
        source,
      });

      if (error || data?.success === false) {
        toast.error(data?.error || "We couldn't send your request. Please try again.");
        return;
      }

      setResult({
        repairTitle: data?.repairTitle ?? repair.trim(),
        estimate: data?.estimate ?? null,
        shopPrice: data?.shopPrice ?? null,
      });
      toast.success(`Your request was sent to ${businessName || "the shop"}.`);
    } catch (err) {
      console.error("[QuoteRequestDialog]", err);
      toast.error("We couldn't send your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-primary" />
            Just need a price?
          </DialogTitle>
          <DialogDescription>
            Tell us what you need and we'll send you a market-based range{businessName ? ` plus ${businessName}'s price` : ""}. No
            appointment required.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            <p className="text-sm font-medium">{result.repairTitle}</p>
            {result.estimate ? (
              <div className="rounded-lg border border-border p-4 space-y-1">
                <p className="text-sm text-muted-foreground">Typical independent shop range</p>
                <p className="text-2xl font-semibold">
                  {fmt(result.estimate.low)} – {fmt(result.estimate.high)}
                </p>
                <p className="text-xs text-muted-foreground">Average {fmt(result.estimate.avg)}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                We've sent your request over — the shop will follow up with exact pricing.
              </p>
            )}
            {result.shopPrice ? (
              <Badge variant="secondary" className="text-xs">
                {businessName || "This shop"}: {fmt(result.shopPrice)}
              </Badge>
            ) : null}
            <Button className="w-full" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="qr-repair">What do you need?</Label>
              <Input
                id="qr-repair"
                value={repair}
                onChange={(e) => setRepair(e.target.value)}
                placeholder="Brake pad replacement"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-2">
                <Label htmlFor="qr-year">Year</Label>
                <Input id="qr-year" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2019" inputMode="numeric" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="qr-make">Make</Label>
                <Input id="qr-make" value={make} onChange={(e) => setMake(e.target.value)} placeholder="Honda" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="qr-model">Model</Label>
                <Input id="qr-model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Accord" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="qr-vin">VIN (optional — gives an exact range)</Label>
              <Input
                id="qr-vin"
                value={vin}
                onChange={(e) => setVin(e.target.value.toUpperCase())}
                maxLength={17}
                placeholder="1HGCM82633A004352"
                className="font-mono uppercase"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="qr-name">Your name</Label>
                <Input id="qr-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="qr-phone">Phone</Label>
                <Input id="qr-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="qr-email">Email</Label>
              <Input id="qr-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="qr-notes">Anything else? (optional)</Label>
              <Textarea id="qr-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>

            <p className="text-xs text-muted-foreground">Add an email or phone number so the shop can reply.</p>

            <Button className="w-full" disabled={!canSubmit} onClick={handleSubmit}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Get my estimate"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default QuoteRequestDialog;

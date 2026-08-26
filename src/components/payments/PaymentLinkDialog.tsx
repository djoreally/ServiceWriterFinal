import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link2, Copy, Check, ExternalLink } from "lucide-react";
import { toast } from "@/components/ui/sonner";

interface PaymentLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentUrl: string | null;
  customerEmail: string | null;
}

export function PaymentLinkDialog({
  open,
  onOpenChange,
  paymentUrl,
  customerEmail,
}: PaymentLinkDialogProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!paymentUrl) return;
    
    try {
      await navigator.clipboard.writeText(paymentUrl);
      setCopied(true);
      toast.success("Link copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const handleOpen = () => {
    if (paymentUrl) {
      window.open(paymentUrl, "_blank");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Payment Link Sent
          </DialogTitle>
          <DialogDescription>
            {customerEmail 
              ? `A payment link has been emailed to ${customerEmail}. You can also share it directly below.`
              : "Copy and share this payment link with your customer."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="flex gap-2">
            <Input
              value={paymentUrl || ""}
              readOnly
              className="font-mono text-xs"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={handleCopy}
              className="shrink-0"
            >
              {copied ? (
                <Check className="h-4 w-4 text-gray-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Close
            </Button>
            <Button onClick={handleOpen} className="flex-1 gap-2">
              <ExternalLink className="h-4 w-4" />
              Open Link
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

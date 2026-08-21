import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Receipt } from "lucide-react";
import { ScanReceiptDialog } from "@/components/expenses/ScanReceiptDialog";

interface JobExpenseQuickAddProps {
  appointmentId: string;
  onSaved?: () => void;
}

export function JobExpenseQuickAdd({ appointmentId, onSaved }: JobExpenseQuickAddProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => setOpen(true)}>
        <Receipt className="h-4 w-4" /> Add Expense to Job
      </Button>
      <ScanReceiptDialog
        open={open}
        onOpenChange={setOpen}
        appointmentId={appointmentId}
        defaultBillable
        onSaved={onSaved}
      />
    </>
  );
}

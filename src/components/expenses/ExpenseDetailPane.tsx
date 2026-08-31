import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, X, Trash2, ExternalLink, Pencil, History } from "lucide-react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { toast } from "@/hooks/use-toast";
import type { ExpenseActivityRow, ExpenseRow } from "@/application/queries/expenses.query";
import { fetchExpenseActivity, fetchExpenseLineItems } from "@/application/queries/expenses.query";
import { approveExpense, rejectExpense, softDeleteExpense, getReceiptSignedUrl } from "@/application/commands/expenses.command";
import { useAuth } from "@packages/auth";
import { ProgressiveImage } from "@/components/media/ProgressiveImage";

interface ExpenseDetailPaneProps {
  expense: ExpenseRow | null;
  categoryName: string | null;
  onChanged: () => void;
  onEdit?: (expense: ExpenseRow) => void;
}

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export function ExpenseDetailPane({ expense, categoryName, onChanged, onEdit }: ExpenseDetailPaneProps) {
  const { session } = useAuth();
  const [items, setItems] = useState<LineItem[]>([]);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [activity, setActivity] = useState<ExpenseActivityRow[]>([]);

  useEffect(() => {
    if (!expense) { void Promise.resolve().then(() => setItems([])); void Promise.resolve().then(() => setSignedUrl(null)); void Promise.resolve().then(() => setActivity([])); return; }
    (async () => {
      const [{ data: lineItems }, { data: timeline }] = await Promise.all([
        fetchExpenseLineItems(expense.id),
        fetchExpenseActivity(expense.id),
      ]);
      setItems((lineItems as LineItem[]) ?? []);
      setActivity((timeline as ExpenseActivityRow[]) ?? []);
      if (expense.receipt_url) {
        const url = await getReceiptSignedUrl(expense.receipt_url);
        setSignedUrl(url);
      } else {
        setSignedUrl(null);
      }
    })();
  }, [expense]);

  const timelineItems = useMemo(() => activity.map((entry) => {
    const labelMap: Record<ExpenseActivityRow["event_type"], string> = {
      created: "Created",
      edited: "Edited",
      approved: "Approved",
      rejected: "Rejected",
      deleted: "Deleted",
    };

    const detailMap: Partial<Record<ExpenseActivityRow["event_type"], string>> = {
      rejected: typeof entry.details?.reason === "string" ? entry.details.reason : undefined,
      edited: typeof entry.details?.vendor_name_raw === "string" ? `Updated ${entry.details.vendor_name_raw}` : undefined,
      created: typeof entry.details?.vendor_name_raw === "string" ? `Entered for ${entry.details.vendor_name_raw}` : undefined,
    };

    return {
      ...entry,
      label: labelMap[entry.event_type],
      detail: detailMap[entry.event_type],
    };
  }), [activity]);

  if (!expense) {
    return (
      <Card>
        <CardContent className="p-12 text-center text-sm text-muted-foreground">
          Select an expense to view details.
        </CardContent>
      </Card>
    );
  }

  const handleApprove = async () => {
    const user = session?.user;
    if (!user) return;
    const { error } = await approveExpense(expense.id, user.id);
    if (error) toast({ title: "Failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Approved" }); onChanged(); }
  };

  const handleReject = async () => {
    const reason = prompt("Reason for rejection?") ?? "";
    if (!reason) return;
    const user = session?.user;
    if (!user) return;
    const { error } = await rejectExpense(expense.id, reason, user.id);
    if (error) toast({ title: "Failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Rejected" }); onChanged(); }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this expense?")) return;
    const user = session?.user;
    if (!user) return;
    const { error } = await softDeleteExpense(expense.id, user.id);
    if (error) toast({ title: "Failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Deleted" }); onChanged(); }
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-bold text-lg">{expense.vendor_name_raw}</h3>
            <p className="text-xs text-muted-foreground">
              {format(parseISO(expense.transaction_date), "MMMM d, yyyy")}
            </p>
          </div>
          <Badge variant="outline">{expense.status}</Badge>
        </div>

        {signedUrl && (
          <a href={signedUrl} target="_blank" rel="noreferrer" className="block">
            <ProgressiveImage src={signedUrl} alt="Receipt" className="w-full rounded-lg border max-h-64 object-contain bg-muted" placeholderClassName="w-full h-64 rounded-lg" />
            <span className="text-xs text-primary flex items-center gap-1 mt-1"><ExternalLink className="h-3 w-3" /> Open full size</span>
          </a>
        )}

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div><span className="text-muted-foreground">Category:</span> <span className="font-medium">{categoryName ?? "—"}</span></div>
          <div><span className="text-muted-foreground">Payment:</span> <span className="font-medium">{expense.payment_method ?? "—"}{expense.last4 ? ` •••• ${expense.last4}` : ""}</span></div>
          <div><span className="text-muted-foreground">Subtotal:</span> <span className="font-medium tabular-nums">${Number(expense.subtotal).toFixed(2)}</span></div>
          <div><span className="text-muted-foreground">Tax:</span> <span className="font-medium tabular-nums">${Number(expense.tax_amount).toFixed(2)}</span></div>
          <div className="col-span-2 pt-1 border-t"><span className="text-muted-foreground">Total:</span> <span className="font-black text-base tabular-nums ml-1">${Number(expense.total_amount).toFixed(2)}</span></div>
          {expense.reference_number && <div className="col-span-2"><span className="text-muted-foreground">Ref:</span> <span className="font-mono">{expense.reference_number}</span></div>}
          {expense.notes && <div className="col-span-2"><span className="text-muted-foreground">Notes:</span> {expense.notes}</div>}
        </div>

        {items.length > 0 && (
          <div className="border-t pt-2">
            <p className="text-xs uppercase tracking-wider font-bold text-muted-foreground mb-2">Line items</p>
            <div className="space-y-1 text-xs">
              {items.map((li) => (
                <div key={li.id} className="flex justify-between gap-2">
                  <span className="truncate">{li.description}</span>
                  <span className="text-muted-foreground tabular-nums">{li.quantity} × ${Number(li.unit_price).toFixed(2)} = ${Number(li.line_total).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="border-t pt-3">
          <div className="flex items-center gap-2 mb-3">
            <History className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Activity</p>
          </div>
          {timelineItems.length === 0 ? (
            <p className="text-xs text-muted-foreground">No activity recorded yet.</p>
          ) : (
            <ScrollArea className="max-h-56 pr-3">
              <div className="space-y-3">
                {timelineItems.map((entry, index) => (
                  <div key={entry.id} className="flex gap-3">
                    <div className="flex flex-col items-center pt-1">
                      <span className="size-2 rounded-md bg-primary" />
                      {index !== timelineItems.length - 1 && <Separator orientation="vertical" className="mt-1 h-full min-h-8" />}
                    </div>
                    <div className="min-w-0 flex-1 pb-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{entry.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {entry.actor_name ?? "Team member"} • {formatDistanceToNow(parseISO(entry.created_at), { addSuffix: true })}
                          </p>
                        </div>
                        <p className="text-[11px] text-muted-foreground whitespace-nowrap">
                          {format(parseISO(entry.created_at), "MMM d, yyyy h:mm a")}
                        </p>
                      </div>
                      {entry.detail && <p className="text-xs text-muted-foreground mt-1">{entry.detail}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        <div className="flex gap-2 pt-2 border-t">
          <Button size="sm" variant="outline" onClick={() => onEdit?.(expense)} className="gap-1">
            <Pencil className="h-3 w-3" /> Edit
          </Button>
          {expense.status === "pending" && (
            <>
              <Button size="sm" onClick={handleApprove} className="gap-1"><Check className="h-3 w-3" /> Approve</Button>
              <Button size="sm" variant="outline" onClick={handleReject} className="gap-1"><X className="h-3 w-3" /> Reject</Button>
            </>
          )}
          <Button size="sm" variant="ghost" onClick={handleDelete} className="gap-1 ml-auto text-destructive"><Trash2 className="h-3 w-3" /> Delete</Button>
        </div>
      </CardContent>
    </Card>
  );
}

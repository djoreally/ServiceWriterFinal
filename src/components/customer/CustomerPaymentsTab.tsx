import { useState, useEffect, useCallback } from "react";
import { fetchCustomerPaymentHistory, type CustomerPaymentRecord } from "@/application/queries";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, Clock, AlertCircle, ReceiptText, Calendar, RefreshCcw, ExternalLink } from "lucide-react";
import { format, parseISO } from "date-fns";
import { formatMoney } from "@/lib/financialMath";

type PaymentRow = CustomerPaymentRecord;
const PAYMENT_STATUS_STYLES: Record<string,string> = { paid:"bg-gray-500/10 text-gray-500 border-gray-500/20", pending:"bg-yellow-500/10 text-yellow-500 border-yellow-500/20", unpaid:"bg-red-500/10 text-red-500 border-red-500/20", refunded:"bg-purple-500/10 text-purple-500 border-purple-500/20", partial:"bg-orange-500/10 text-orange-500 border-orange-500/20" };
const PAYMENT_STATUS_ICONS: Record<string,React.ReactNode> = { paid:<CheckCircle className="mr-1 h-3 w-3" />, pending:<Clock className="mr-1 h-3 w-3" />, unpaid:<AlertCircle className="mr-1 h-3 w-3" />, refunded:<RefreshCcw className="mr-1 h-3 w-3" /> };

interface Props { account: { id:string; email:string; full_name:string|null } }

export function CustomerPaymentsTab({ account }: Props) {
  const [loading,setLoading] = useState(true);
  const [payments,setPayments] = useState<PaymentRow[]>([]);
  const fetchPayments = useCallback(async () => { setLoading(true); try { setPayments(await fetchCustomerPaymentHistory(account.id)); } catch (error) { console.error("[CustomerPaymentsTab] Failed to load payments", error); } finally { setLoading(false); } },[account.id]);
  useEffect(() => { queueMicrotask(() => { void fetchPayments(); }); },[fetchPayments]);

  const totalPaid = payments.filter((p)=>p.payment_status==="paid").reduce((sum,p)=>sum+(p.estimated_cost||0),0);
  const totalPending = payments.filter((p)=>p.payment_status==="pending"||p.payment_status==="unpaid").reduce((sum,p)=>sum+(p.estimated_cost||0),0);
  const totalRefunded = payments.filter((p)=>p.payment_status==="refunded").reduce((sum,p)=>sum+(p.estimated_cost||0),0);
  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const summary = [
    { label:"Total Paid", value:totalPaid, icon:<CheckCircle className="h-5 w-5" /> },
    { label:"Pending / Unpaid", value:totalPending, icon:<Clock className="h-5 w-5" /> },
    { label:"Refunded", value:totalRefunded, icon:<RefreshCcw className="h-5 w-5" /> },
  ];

  return <div>
    <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">{summary.map((item)=><Card key={item.label} className="border-border/50"><CardContent className="p-4"><div className="flex items-center gap-3"><div className="rounded-lg bg-muted p-2">{item.icon}</div><div><p className="text-sm text-muted-foreground">{item.label}</p><p className="text-2xl font-bold">${formatMoney(item.value)}</p></div></div></CardContent></Card>)}</div>
    {payments.length===0 ? <Card className="border-border/50"><CardContent className="p-12 text-center"><ReceiptText className="mx-auto mb-4 h-12 w-12 text-muted-foreground" /><h3 className="mb-2 font-semibold">No payment history</h3><p className="text-muted-foreground">Payments for your appointments will appear here.</p></CardContent></Card> :
      <div className="space-y-3">{payments.map((payment)=>{
        const date=parseISO(payment.scheduled_date); const pStatus=payment.payment_status||"pending";
        const actionUrl = payment.receipt_url || payment.payment_url;
        const actionLabel = payment.receipt_url ? "View receipt" : payment.payment_url ? "View / pay invoice" : null;
        return <Card key={payment.id} className="border-border/50"><CardContent className="p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1 space-y-2"><div className="flex flex-wrap items-center gap-2"><Badge className={PAYMENT_STATUS_STYLES[pStatus]||PAYMENT_STATUS_STYLES.pending}>{PAYMENT_STATUS_ICONS[pStatus]}{pStatus.charAt(0).toUpperCase()+pStatus.slice(1)}</Badge>{payment.invoice_number!=null && <Badge variant="outline">Invoice #{payment.invoice_number}</Badge>}</div><h3 className="font-semibold">{payment.service_catalog?.name||payment.title}</h3><div className="flex items-center gap-1 text-sm text-muted-foreground"><Calendar className="h-4 w-4" /><span>{format(date,"MMM d, yyyy")}</span></div>{payment.invoice_id && !actionUrl && pStatus!=="paid" && <p className="text-xs text-muted-foreground">Your invoice is ready. A secure payment link will appear here when the service provider sends it.</p>}</div>
          <div className="space-y-3 sm:text-right">{payment.estimated_cost!=null && <div><p className="text-xl font-bold">${formatMoney(payment.estimated_cost)}</p>{payment.tax_amount!=null&&payment.tax_amount>0&&<p className="text-xs text-muted-foreground">incl. ${formatMoney(payment.tax_amount)} tax</p>}</div>}{actionUrl&&actionLabel&&<Button asChild size="sm"><a href={actionUrl} target="_blank" rel="noreferrer">{actionLabel}<ExternalLink className="ml-2 h-4 w-4" /></a></Button>}</div>
        </div></CardContent></Card>;
      })}</div>}
  </div>;
}

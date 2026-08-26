/**
 * AbandonedBookingsPanel — abandoned-cart monitor for the public booking
 * funnel. Surfaces every visitor session that started a booking but did
 * not convert, and lets the owner send a recovery email to anyone who
 * entered an address.
 *
 * Data source: `abandoned_bookings` table populated by the public booking
 * page via `useBookingTracker`. Identity is cookie-first (anon session id)
 * with email layered on top when captured.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@packages/auth";
import { fetchAbandonedBookings, type AbandonedBookingRow as ABR } from "@/application/queries/marketing.query";
import { sendMarketingEmail, markAbandonedBookingRecoverySent } from "@/application/commands/marketing.command";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, ShoppingCart, Mail, RefreshCw, UserX, Send, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { toast } from "@/components/ui/sonner";

interface AbandonedBookingRow {
  id: string;
  guest_email: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  last_step: number;
  session_id: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  service_catalog_id: string | null;
  recovered: boolean | null;
  recovery_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

const STEP_LABELS: Record<number, string> = {
  1: "Service",
  2: "Vehicle",
  3: "Location",
  4: "Date / Time",
  5: "Contact",
  6: "Confirmation",
};

export function AbandonedBookingsPanel() {
  const { user } = useAuth();
  const [rows, setRows] = useState<AbandonedBookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data, error } = await fetchAbandonedBookings(user.id);
      if (error) throw error;
      setRows((data as AbandonedBookingRow[]) ?? []);
    } catch (err) {
      console.error("Abandoned bookings fetch failed:", err);
      toast.error("Failed to load abandoned bookings");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const metrics = useMemo(() => {
    const active = rows.filter((r) => !r.recovered);
    const withEmail = active.filter((r) => !!r.guest_email);
    const recovered = rows.filter((r) => r.recovered);
    return {
      total: rows.length,
      active: active.length,
      contactable: withEmail.length,
      recovered: recovered.length,
    };
  }, [rows]);

  const handleSendRecovery = async (row: AbandonedBookingRow) => {
    if (!row.guest_email) {
      toast.error("No email captured for this visitor — cannot send recovery.");
      return;
    }
    setSendingId(row.id);
    try {
      const subject = "Finish booking your appointment";
      const html = `
        <div style="font-family: Inter, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
          <h2 style="color:#111;margin:0 0 16px;">${row.guest_name ? `Hi ${row.guest_name},` : "Hi there,"}</h2>
          <p style="line-height:1.6;color:#333;">
            We noticed you started booking an appointment with us but didn't quite finish.
            Your selections are still saved — just pick up where you left off.
          </p>
          <p style="margin: 24px 0;">
            <a href="${window.location.origin}" style="background:#0a84ff;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">
              Finish booking
            </a>
          </p>
          <p style="font-size:12px;color:#888;">Got there already? Ignore this note.</p>
        </div>
      `;
      await sendMarketingEmail({ to: row.guest_email, subject, html });

      // Stamp recovery_sent_at locally + on server
      await markAbandonedBookingRecoverySent(row.id);

      toast.success(`Recovery email sent to ${row.guest_email}`);
      fetchRows();
    } catch (err) {
      console.error("Recovery send failed:", err);
      toast.error(err instanceof Error ? err.message : "Failed to send recovery email");
    } finally {
      setSendingId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Abandoned Bookings
          </CardTitle>
          <CardDescription>
            Visitors who started a booking but didn't finish — tracked from step 1 by cookie.
            Recovery emails are sent only when an email was captured.
          </CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchRows} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Total Sessions" value={metrics.total} />
          <Stat label="Active Carts" value={metrics.active} accent />
          <Stat label="Contactable" value={metrics.contactable} icon={<Mail className="h-4 w-4" />} />
          <Stat label="Recovered" value={metrics.recovered} icon={<CheckCircle2 className="h-4 w-4 text-green-600" />} />
        </div>

        {/* Table */}
        <ScrollArea className="h-[360px] border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Visitor</TableHead>
                <TableHead>Last Step</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead>Activity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No abandoned booking sessions yet.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => {
                  const stepLabel = STEP_LABELS[row.last_step] ?? `Step ${row.last_step}`;
                  return (
                    <TableRow key={row.id} className={row.recovered ? "opacity-60" : ""}>
                      <TableCell>
                        {row.guest_email ? (
                          <div>
                            <div className="font-medium text-sm">{row.guest_name || row.guest_email}</div>
                            <div className="text-xs text-muted-foreground">{row.guest_email}</div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-muted-foreground text-sm">
                            <UserX className="h-3 w-3" />
                            Anonymous
                            <span className="text-xs">({(row.session_id || "").slice(0, 8)}…)</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{stepLabel}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.scheduled_date
                          ? `${row.scheduled_date}${row.scheduled_time ? " · " + row.scheduled_time.slice(0, 5) : ""}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDistanceToNow(parseISO(row.updated_at), { addSuffix: true })}
                      </TableCell>
                      <TableCell>
                        {row.recovered ? (
                          <Badge className="bg-green-100 text-green-700">Recovered</Badge>
                        ) : row.recovery_sent_at ? (
                          <Badge variant="outline">Email sent</Badge>
                        ) : (
                          <Badge variant="secondary">Active</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!row.guest_email || sendingId === row.id || !!row.recovered}
                          onClick={() => handleSendRecovery(row)}
                        >
                          {sendingId === row.id ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <Send className="h-3 w-3 mr-1" />
                          )}
                          Recover
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: number;
  accent?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className="p-3 border rounded-lg bg-muted/30">
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className={`text-2xl font-bold ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

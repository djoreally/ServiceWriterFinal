/**
 * The morning read, pushed (Reports Machine §6 — Robert: "the machine
 * reads the twelve tabs so the owner does not have to... a thing that
 * reports to him"). A daily worker emails each workspace's owner the
 * exception list ranked by dollars, computed with the same definitions
 * the in-app morning read uses (house owed = open status AND balance
 * over $0.01; due = 90+ days since last service; high churn = 180+).
 * Workspaces with nothing to report get no email — the machine does
 * not manufacture noise.
 */

type AdminDb = any;

export interface MorningReadLine {
  label: string;
  detail: string;
  dollars: number;
}

const dollars = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const money = (value: number): string =>
  `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const DAY_MS = 86_400_000;

export async function buildMorningRead(db: AdminDb, workspaceId: string): Promise<MorningReadLine[]> {
  const now = Date.now();
  const thirtyDaysAgoIso = new Date(now - 30 * DAY_MS).toISOString();
  const [openInvoicesRes, recentRecordsRes, recentExpensesRes, allRecordsRes, customersRes] = await Promise.all([
    db.from("invoices").select("total,amount_paid,issued_at,created_at")
      .eq("workspace_id", workspaceId).in("status", ["issued", "partially_paid", "past_due"]),
    db.from("service_records").select("appointment_id,customer_id,total_amount,completed_at")
      .eq("workspace_id", workspaceId).eq("status", "completed").gte("completed_at", thirtyDaysAgoIso),
    db.from("expenses").select("total_amount,transaction_date,category_id,appointment_id,status")
      .eq("workspace_id", workspaceId).is("deleted_at", null).gte("transaction_date", thirtyDaysAgoIso.slice(0, 10)),
    db.from("service_records").select("customer_id,total_amount,completed_at")
      .eq("workspace_id", workspaceId).eq("status", "completed"),
    db.from("customers").select("id,first_name,last_name,company_name").eq("workspace_id", workspaceId),
  ]);
  for (const result of [openInvoicesRes, recentRecordsRes, recentExpensesRes, allRecordsRes, customersRes]) {
    if (result.error) throw result.error;
  }

  const lines: MorningReadLine[] = [];

  // Receivables aging into the danger bucket (open balances only — the
  // house owed definition).
  let agedAmount = 0;
  let agedCount = 0;
  for (const invoice of openInvoicesRes.data ?? []) {
    const balance = dollars(invoice.total) - dollars(invoice.amount_paid);
    if (balance <= 0.01) continue;
    const issued = new Date(String(invoice.issued_at ?? invoice.created_at)).getTime();
    if (!Number.isFinite(issued)) continue;
    if (Math.floor((now - issued) / DAY_MS) > 90) {
      agedAmount += balance;
      agedCount += 1;
    }
  }
  if (agedAmount > 0) {
    lines.push({
      label: "Receivables over 90 days old",
      detail: `${agedCount} open invoice${agedCount === 1 ? "" : "s"}`,
      dollars: agedAmount,
    });
  }

  // Jobs whose margin went negative (last 30 days), worst named with the
  // why: what its appointment-linked expenses were spent on.
  const expenses = (recentExpensesRes.data ?? []).filter((row: any) => row.status !== "rejected");
  const costsByAppointment = new Map<string, number>();
  for (const expense of expenses) {
    if (!expense.appointment_id) continue;
    costsByAppointment.set(expense.appointment_id, (costsByAppointment.get(expense.appointment_id) ?? 0) + dollars(expense.total_amount));
  }
  const customerNameById = new Map<string, string>(
    (customersRes.data ?? []).map((row: any) => [
      row.id,
      row.company_name || `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || "Unknown customer",
    ]),
  );
  const margins = (recentRecordsRes.data ?? []).map((row: any) => {
    const billed = dollars(row.total_amount);
    const consumed = row.appointment_id ? costsByAppointment.get(row.appointment_id) ?? 0 : 0;
    return { customer: row.customer_id ? customerNameById.get(row.customer_id) ?? "Unknown customer" : "Unknown customer", date: String(row.completed_at ?? "").slice(0, 10), billed, consumed, kept: billed - consumed, appointmentId: row.appointment_id as string | null };
  });
  const underwater = margins.filter((row: { kept: number }) => row.kept < 0).sort((a: any, b: any) => a.kept - b.kept);
  if (underwater.length) {
    const worst = underwater[0];
    let why = "";
    if (worst.appointmentId) {
      const categoryIds = [...new Set(expenses.filter((e: any) => e.appointment_id === worst.appointmentId).map((e: any) => e.category_id).filter(Boolean))];
      const nameById = new Map<string, string>();
      if (categoryIds.length) {
        const { data: categories } = await db.from("expense_categories").select("id,name").in("id", categoryIds);
        for (const category of categories ?? []) nameById.set(category.id, category.name);
      }
      const byCategory = new Map<string, number>();
      for (const expense of expenses) {
        if (expense.appointment_id !== worst.appointmentId) continue;
        const name = (expense.category_id ? nameById.get(expense.category_id) : null) || "Uncategorized";
        byCategory.set(name, (byCategory.get(name) ?? 0) + dollars(expense.total_amount));
      }
      const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
      if (top.length) why = ` — consumed mostly ${top.map(([name, total]) => `${name} ${money(total)}`).join(", ")}`;
    }
    const totalLost = Math.abs(underwater.reduce((sum: number, row: any) => sum + row.kept, 0));
    lines.push({
      label: `Worst job: ${worst.customer}${worst.date ? ` (${worst.date})` : ""}`,
      detail: `Billed ${money(worst.billed)}, kept ${money(worst.kept)}${why}${underwater.length > 1 ? ` · ${underwater.length} jobs under water in the last 30 days, ${money(totalLost)} lost` : ""}`,
      dollars: Math.abs(worst.kept),
    });
  }

  // Customers waiting + lifetime value at high churn risk (current state,
  // from each customer's full completed-service history).
  const historyByCustomer = new Map<string, { last: number; lifetime: number }>();
  for (const record of allRecordsRes.data ?? []) {
    if (!record.customer_id) continue;
    const when = new Date(String(record.completed_at ?? "")).getTime();
    if (!Number.isFinite(when)) continue;
    const entry = historyByCustomer.get(record.customer_id) ?? { last: 0, lifetime: 0 };
    entry.last = Math.max(entry.last, when);
    entry.lifetime += dollars(record.total_amount);
    historyByCustomer.set(record.customer_id, entry);
  }
  let dueCount = 0;
  let dueValue = 0;
  let riskCount = 0;
  let riskValue = 0;
  for (const entry of historyByCustomer.values()) {
    const days = Math.floor((now - entry.last) / DAY_MS);
    if (days >= 90) {
      dueCount += 1;
      dueValue += entry.lifetime;
    }
    if (days >= 180) {
      riskCount += 1;
      riskValue += entry.lifetime;
    }
  }
  if (dueCount && dueValue > 0) {
    lines.push({ label: "Customers due for service, waiting", detail: `${dueCount} customers past 90 days — reach them from the Customers tab in Reports`, dollars: dueValue });
  }
  if (riskCount && riskValue > 0) {
    lines.push({ label: "Lifetime value at high churn risk", detail: `${riskCount} customers flagged high risk`, dollars: riskValue });
  }

  return lines.sort((a, b) => b.dollars - a.dollars);
}

export function morningReadEmailHtml(businessName: string, lines: MorningReadLine[]): string {
  const items = lines
    .map((line) => `<p style="margin:0 0 14px"><strong>${money(line.dollars)}</strong> — ${escapeHtml(line.label)}<br /><span style="color:#555">${escapeHtml(line.detail)}</span></p>`)
    .join("");
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px">
    <h1 style="font-size:20px;margin:0 0 4px">Your morning read</h1>
    <p style="color:#555;margin:0 0 20px">${escapeHtml(businessName)} — exceptions ranked by dollars, read from your own reports so you do not have to.</p>
    ${items}
    <p style="margin:24px 0 0"><a href="https://www.servicewriter.xyz/reports">Open Reports</a> to act on them.</p>
  </div>`;
}

export async function sendMorningReads(db: AdminDb): Promise<{
  workspaces: number;
  sent: number;
  skipped: number;
  failures: Array<{ workspaceId: string; error: string }>;
}> {
  const { data: profiles, error } = await db
    .from("business_profiles")
    .select("workspace_id,business_name,email")
    .not("email", "is", null);
  if (error) throw error;

  let sent = 0;
  let skipped = 0;
  const failures: Array<{ workspaceId: string; error: string }> = [];
  for (const profile of profiles ?? []) {
    const to = String(profile.email ?? "").trim();
    const workspaceId = String(profile.workspace_id ?? "");
    if (!to || !workspaceId) {
      skipped += 1;
      continue;
    }
    try {
      const lines = await buildMorningRead(db, workspaceId);
      if (!lines.length) {
        skipped += 1;
        continue;
      }
      const businessName = String(profile.business_name ?? "").trim() || "Your shop";
      const { error: sendError } = await db.functions.invoke("send-email", {
        body: { to, subject: `Your morning read — ${businessName}`, html: morningReadEmailHtml(businessName, lines) },
      });
      if (sendError) throw new Error(sendError.message || "send-email failed");
      sent += 1;
    } catch (caught) {
      failures.push({ workspaceId, error: caught instanceof Error ? caught.message.slice(0, 300) : "unknown error" });
    }
  }
  return { workspaces: (profiles ?? []).length, sent, skipped, failures };
}

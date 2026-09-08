import Stripe from "stripe";
import {
  resolveStripeWorkspaceExecution,
  stripePaymentMode,
  type StripeWorkspaceExecution,
} from "@/server/payments/stripe-workspace-execution";

type SupabaseClientLike = any;

export interface StripeInvoiceSyncResult {
  provider: string;
  status: "synced" | "skipped";
  stripeAccountId?: string;
  stripeCustomerId?: string;
  stripeInvoiceId?: string;
  hostedInvoiceUrl?: string | null;
  invoiceStatus?: string | null;
  paymentMode?: "connect" | "direct";
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asStripeCustomerId(metadata: Record<string, unknown>): string | null {
  const id = text(metadata.stripe_customer_id);
  return id?.startsWith("cus_") ? id : null;
}

function asStripeInvoiceId(metadata: Record<string, unknown>): string | null {
  const id = text(metadata.stripe_invoice_id);
  return id?.startsWith("in_") ? id : null;
}

async function retrieveExecutionAccount(execution: StripeWorkspaceExecution): Promise<Stripe.Account> {
  return execution.stripe.accounts.retrieve(execution.accountId);
}

async function refreshStripeWorkspaceState(
  supabase: SupabaseClientLike,
  workspaceId: string,
  operational: Record<string, unknown>,
  execution: StripeWorkspaceExecution,
  account: Stripe.Account,
) {
  const checkedAt = new Date().toISOString();
  const nextOperational = execution.mode === "direct"
    ? {
        ...operational,
        stripe_payment_mode: "direct",
        stripe_direct_account_id: account.id,
        stripe_direct_charges_enabled: account.charges_enabled,
        stripe_direct_payouts_enabled: account.payouts_enabled,
        stripe_direct_details_submitted: account.details_submitted,
        stripe_direct_checked_at: checkedAt,
      }
    : {
        ...operational,
        stripe_payment_mode: "connect",
        stripe_account_id: account.id,
        stripe_account_status: account.charges_enabled ? "active" : "restricted",
        stripe_charges_enabled: account.charges_enabled,
        stripe_payouts_enabled: account.payouts_enabled,
        stripe_onboarding_complete: account.details_submitted,
        stripe_status_checked_at: checkedAt,
      };

  const { error } = await supabase
    .from("workspace_settings")
    .update({ operational_settings: nextOperational })
    .eq("workspace_id", workspaceId);
  if (error) throw error;
}

async function ensureStripeCustomer(params: {
  execution: StripeWorkspaceExecution;
  supabase: SupabaseClientLike;
  workspaceId: string;
  customer: Record<string, any>;
}): Promise<string> {
  const metadata = object(params.customer.metadata);
  let customerId = asStripeCustomerId(metadata);

  if (customerId && text(metadata.stripe_account_id) === params.execution.accountId) {
    try {
      const existing = await params.execution.stripe.customers.retrieve(
        customerId,
        {},
        params.execution.requestOptions(),
      );
      if (!("deleted" in existing) || !existing.deleted) return customerId;
    } catch {
      customerId = null;
    }
  } else {
    customerId = null;
  }

  const line1 = text(params.customer.address_line1);
  const created = await params.execution.stripe.customers.create({
    email: text(params.customer.email) ?? undefined,
    name: [params.customer.first_name, params.customer.last_name].filter(Boolean).join(" ") || params.customer.company_name || undefined,
    phone: text(params.customer.phone) ?? undefined,
    address: line1 ? {
      line1,
      line2: text(params.customer.address_line2) ?? undefined,
      city: text(params.customer.city) ?? undefined,
      state: text(params.customer.region) ?? undefined,
      postal_code: text(params.customer.postal_code) ?? undefined,
      country: text(params.customer.country_code) ?? "US",
    } : undefined,
    metadata: {
      servicewriter_customer_id: String(params.customer.id),
      workspace_id: params.workspaceId,
    },
  }, params.execution.requestOptions(`sw-customer-${params.customer.id}`));

  const { error } = await params.supabase
    .from("customers")
    .update({
      metadata: {
        ...metadata,
        stripe_customer_id: created.id,
        stripe_account_id: params.execution.accountId,
        stripe_payment_mode: params.execution.mode,
        stripe_synced_at: new Date().toISOString(),
      },
    })
    .eq("workspace_id", params.workspaceId)
    .eq("id", params.customer.id);
  if (error) throw error;

  return created.id;
}

export async function syncCanonicalInvoiceToStripe(params: {
  supabase: SupabaseClientLike;
  workspaceId: string;
  appointmentId?: string | null;
  invoiceId: string;
  paymentId: string;
}): Promise<StripeInvoiceSyncResult> {
  const { data: settings, error: settingsError } = await params.supabase
    .from("workspace_settings")
    .select("payment_provider,operational_settings")
    .eq("workspace_id", params.workspaceId)
    .single();
  if (settingsError) throw settingsError;

  const provider = text(settings?.payment_provider) ?? "none";
  if (provider !== "stripe") return { provider, status: "skipped" };

  const operational = object(settings?.operational_settings);
  const execution = resolveStripeWorkspaceExecution(operational);
  const account = await retrieveExecutionAccount(execution);
  await refreshStripeWorkspaceState(params.supabase, params.workspaceId, operational, execution, account);
  if (!account.charges_enabled) {
    throw new Error(`${execution.mode === "direct" ? "Workspace" : "Connected"} Stripe account is not enabled to accept charges.`);
  }

  const [{ data: invoice, error: invoiceError }, { data: payment, error: paymentError }] = await Promise.all([
    params.supabase
      .from("invoices")
      .select("id,customer_id,invoice_number,tax_total,total,metadata")
      .eq("workspace_id", params.workspaceId)
      .eq("id", params.invoiceId)
      .single(),
    params.supabase
      .from("payments")
      .select("id,currency_code,metadata")
      .eq("workspace_id", params.workspaceId)
      .eq("id", params.paymentId)
      .single(),
  ]);
  if (invoiceError || !invoice) throw invoiceError ?? new Error("Canonical invoice not found");
  if (paymentError || !payment) throw paymentError ?? new Error("Canonical payment not found");
  if (!invoice.customer_id) throw new Error("Canonical invoice has no customer.");

  const [{ data: customer, error: customerError }, { data: lines, error: linesError }] = await Promise.all([
    params.supabase
      .from("customers")
      .select("id,first_name,last_name,company_name,email,phone,address_line1,address_line2,city,region,postal_code,country_code,metadata")
      .eq("workspace_id", params.workspaceId)
      .eq("id", invoice.customer_id)
      .single(),
    params.supabase
      .from("invoice_lines")
      .select("id,description,quantity,unit_price,sort_order")
      .eq("workspace_id", params.workspaceId)
      .eq("invoice_id", invoice.id)
      .order("sort_order", { ascending: true }),
  ]);
  if (customerError || !customer) throw customerError ?? new Error("Invoice customer not found");
  if (linesError) throw linesError;

  const stripeCustomerId = await ensureStripeCustomer({
    execution,
    supabase: params.supabase,
    workspaceId: params.workspaceId,
    customer,
  });

  const invoiceMetadata = object(invoice.metadata);
  let stripeInvoice: Stripe.Invoice | null = null;
  const storedStripeInvoiceId = asStripeInvoiceId(invoiceMetadata);
  if (storedStripeInvoiceId && text(invoiceMetadata.stripe_account_id) === execution.accountId) {
    try {
      stripeInvoice = await execution.stripe.invoices.retrieve(
        storedStripeInvoiceId,
        {},
        execution.requestOptions(),
      );
    } catch {
      stripeInvoice = null;
    }
  }

  if (!stripeInvoice) {
    stripeInvoice = await execution.stripe.invoices.create({
      customer: stripeCustomerId,
      collection_method: "send_invoice",
      days_until_due: 1,
      auto_advance: false,
      description: `Service Writer invoice #${invoice.invoice_number}`,
      metadata: {
        servicewriter_invoice_id: String(invoice.id),
        payment_id: String(payment.id),
        workspace_id: params.workspaceId,
        appointment_id: params.appointmentId ?? String(object(payment.metadata).appointment_id ?? ""),
        servicewriter_payment_mode: execution.mode,
      },
    }, execution.requestOptions(`sw-invoice-${invoice.id}`));
  }

  if (stripeInvoice.status === "draft") {
    let syncedCents = 0;
    for (const line of lines ?? []) {
      const amountCents = Math.round(Number(line.quantity || 0) * Number(line.unit_price || 0) * 100);
      if (!amountCents) continue;
      syncedCents += amountCents;
      await execution.stripe.invoiceItems.create({
        customer: stripeCustomerId,
        invoice: stripeInvoice.id,
        amount: amountCents,
        currency: String(payment.currency_code || "USD").toLowerCase(),
        description: line.description || "Service",
        metadata: { servicewriter_invoice_line_id: String(line.id), workspace_id: params.workspaceId },
      }, execution.requestOptions(`sw-invoice-line-${line.id}`));
    }

    const taxCents = Math.round(Number(invoice.tax_total || 0) * 100);
    if (taxCents) {
      syncedCents += taxCents;
      await execution.stripe.invoiceItems.create({
        customer: stripeCustomerId,
        invoice: stripeInvoice.id,
        amount: taxCents,
        currency: String(payment.currency_code || "USD").toLowerCase(),
        description: "Tax",
        metadata: { workspace_id: params.workspaceId },
      }, execution.requestOptions(`sw-invoice-tax-${invoice.id}`));
    }

    const expectedTotalCents = Math.round(Number(invoice.total || 0) * 100);
    const adjustmentCents = expectedTotalCents - syncedCents;
    if (adjustmentCents) {
      await execution.stripe.invoiceItems.create({
        customer: stripeCustomerId,
        invoice: stripeInvoice.id,
        amount: adjustmentCents,
        currency: String(payment.currency_code || "USD").toLowerCase(),
        description: "Invoice adjustment",
        metadata: { workspace_id: params.workspaceId },
      }, execution.requestOptions(`sw-invoice-adjustment-${invoice.id}`));
    }

    stripeInvoice = await execution.stripe.invoices.finalizeInvoice(
      stripeInvoice.id,
      {},
      execution.requestOptions(`sw-invoice-finalize-${invoice.id}`),
    );
  }

  const syncedAt = new Date().toISOString();
  const hostedInvoiceUrl = stripeInvoice.hosted_invoice_url ?? null;
  const paymentMetadata = object(payment.metadata);
  const [{ error: invoiceUpdateError }, { error: paymentUpdateError }] = await Promise.all([
    params.supabase.from("invoices").update({
      metadata: {
        ...invoiceMetadata,
        stripe_customer_id: stripeCustomerId,
        stripe_invoice_id: stripeInvoice.id,
        stripe_account_id: execution.accountId,
        stripe_payment_mode: execution.mode,
        stripe_hosted_invoice_url: hostedInvoiceUrl,
        stripe_invoice_status: stripeInvoice.status,
        stripe_sync_status: "synced",
        stripe_synced_at: syncedAt,
      },
    }).eq("workspace_id", params.workspaceId).eq("id", invoice.id),
    params.supabase.from("payments").update({
      provider: "stripe",
      metadata: {
        ...paymentMetadata,
        stripe_customer_id: stripeCustomerId,
        stripe_invoice_id: stripeInvoice.id,
        stripe_account_id: execution.accountId,
        stripe_payment_mode: execution.mode,
        payment_url: hostedInvoiceUrl,
        stripe_sync_status: "synced",
        stripe_synced_at: syncedAt,
      },
    }).eq("workspace_id", params.workspaceId).eq("id", payment.id),
  ]);
  if (invoiceUpdateError) throw invoiceUpdateError;
  if (paymentUpdateError) throw paymentUpdateError;

  return {
    provider: "stripe",
    status: "synced",
    paymentMode: execution.mode,
    stripeAccountId: execution.accountId,
    stripeCustomerId,
    stripeInvoiceId: stripeInvoice.id,
    hostedInvoiceUrl,
    invoiceStatus: stripeInvoice.status,
  };
}

export async function markStripeInvoicePaidOutOfBand(params: {
  supabase: SupabaseClientLike;
  workspaceId: string;
  invoiceId: string | null;
}): Promise<{ status: "synced" | "skipped"; stripeInvoiceId?: string; paymentMode?: "connect" | "direct" }> {
  if (!params.invoiceId) return { status: "skipped" };

  const [{ data: settings, error: settingsError }, { data: invoice, error: invoiceError }] = await Promise.all([
    params.supabase.from("workspace_settings")
      .select("payment_provider,operational_settings")
      .eq("workspace_id", params.workspaceId)
      .single(),
    params.supabase.from("invoices")
      .select("id,metadata")
      .eq("workspace_id", params.workspaceId)
      .eq("id", params.invoiceId)
      .single(),
  ]);
  if (settingsError) throw settingsError;
  if (invoiceError || !invoice) throw invoiceError ?? new Error("Invoice not found");
  if (settings?.payment_provider !== "stripe") return { status: "skipped" };

  const operational = object(settings.operational_settings);
  const execution = resolveStripeWorkspaceExecution(operational);
  const metadata = object(invoice.metadata);
  const stripeInvoiceId = asStripeInvoiceId(metadata);
  if (!stripeInvoiceId || text(metadata.stripe_account_id) !== execution.accountId) {
    return { status: "skipped" };
  }

  const current = await execution.stripe.invoices.retrieve(
    stripeInvoiceId,
    {},
    execution.requestOptions(),
  );
  if (current.status !== "paid" && current.status !== "void") {
    await execution.stripe.invoices.pay(
      stripeInvoiceId,
      { paid_out_of_band: true },
      execution.requestOptions(`sw-invoice-oob-paid-${invoice.id}`),
    );
  }

  return {
    status: "synced",
    stripeInvoiceId,
    paymentMode: stripePaymentMode(operational),
  };
}

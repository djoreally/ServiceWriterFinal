import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("canonical invoice delivery schema contract", () => {
  it("keeps invoice delivery on the invoice-domain endpoint", () => {
    const dialog = read("src/components/invoices/SendInvoiceDialog.tsx");
    const command = read("src/application/commands/invoice-send.command.ts");

    expect(dialog).toContain('from "@/application/commands/invoice-send.command"');
    expect(command).toContain('/v1/invoices/${encodeURIComponent(params.invoiceId)}/send');
    expect(command).not.toContain("send_manual_invoice");
    expect(command).not.toContain("/v1/payments/actions");
  });

  it("does not query nonexistent invoice currency or stored line totals", () => {
    const route = read("app/api/v1/invoices/[id]/send/route.ts");

    expect(route).toContain('.from("workspaces")');
    expect(route).toContain('.select("name,currency_code")');
    expect(route).not.toContain("total,amount_paid,currency_code");
    expect(route).not.toContain("unit_price,line_total");
    expect(route).toContain("lineAmount(line.quantity, line.unit_price)");
  });

  it("records delivery evidence through the trusted server client", () => {
    const route = read("app/api/v1/invoices/[id]/send/route.ts");
    const sender = read("src/server/messaging/lifecycle-sender.ts");

    // The route delegates delivery to the lifecycle sender, which records
    // message_logs evidence through the admin (trusted server) client —
    // never through the caller's RLS-scoped client in the route itself.
    expect(route).toContain("sendLifecycleEmail");
    expect(sender).toContain("createSupabaseAdminClient");
    expect(sender).toContain('supabase.from("message_logs").upsert');
    expect(route).not.toContain('from("message_logs")');
  });
});

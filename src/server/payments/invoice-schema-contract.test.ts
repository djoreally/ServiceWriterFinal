import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

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

    expect(route).toContain('createSupabaseAdminClient');
    expect(route).toContain('admin.from("message_logs").insert');
    expect(route).not.toContain('supabase.from("message_logs").insert');
  });
});

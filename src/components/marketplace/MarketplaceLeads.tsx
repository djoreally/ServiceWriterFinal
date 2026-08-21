import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import type { MarketplaceLead } from "@/application/queries/marketplace-provider.query";

interface Props {
  leads: MarketplaceLead[];
}

const statusVariant = (status: string) =>
  status === "pending" ? "outline" : status === "cancelled" ? "destructive" : "secondary";

export function MarketplaceLeads({ leads }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Marketplace leads</CardTitle>
        <p className="text-sm text-muted-foreground">
          Booking requests that came from your public marketplace listing.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {leads.length === 0 && (
          <p className="text-sm text-muted-foreground">No marketplace leads yet.</p>
        )}
        {leads.map((lead) => {
          const contact = [lead.guest_phone, lead.guest_email].filter(Boolean).join(" · ");
          return (
            <div
              key={lead.id}
              className="flex flex-col gap-2 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-foreground">
                    {lead.customer_name || lead.guest_name || "New customer"}
                  </p>
                  <Badge variant={statusVariant(lead.status)}>{lead.status}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {lead.title} · {lead.scheduled_date}
                  {lead.scheduled_time ? ` at ${lead.scheduled_time}` : ""}
                  {lead.vehicle_label ? ` · ${lead.vehicle_label}` : ""}
                </p>
                {contact && <p className="text-xs text-muted-foreground">{contact}</p>}
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link to={`/appointments/${lead.id}`}>View request</Link>
              </Button>
            </div>
          );
        })}

      </CardContent>
    </Card>
  );
}

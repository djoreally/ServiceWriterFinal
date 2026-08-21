import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Eye, Send } from "lucide-react";

const campaigns = [
  { name: "Q4 Architectural Partnership Outreach", status: "Drafting", time: "2m ago" },
  { name: "Urban Development Series #2", status: "Scheduled", time: "Oct 24" },
  { name: "Ledger Integration Newsletter", status: "Sent", time: "Oct 21" },
  { name: "Re: Project Phoenix Followup", status: "Draft", time: "Oct 19" },
];

export const AdminEmailCampaignShowcase = () => {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Email Campaigns Experience</CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl">Campaigns</CardTitle>
                <Button size="sm" className="gap-1">
                  <Plus className="h-4 w-4" />
                  New Draft
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {campaigns.map((campaign) => (
                <div key={campaign.name} className="rounded-lg border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <Badge variant="secondary">{campaign.status}</Badge>
                    <span className="text-xs text-muted-foreground">{campaign.time}</span>
                  </div>
                  <p className="text-sm font-semibold">{campaign.name}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="space-y-4 border-b">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-xl">Q4 Architectural Partnership Outreach</CardTitle>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="gap-2">
                    <Eye className="h-4 w-4" />
                    Preview
                  </Button>
                  <Button size="sm" className="gap-2">
                    <Send className="h-4 w-4" />
                    Schedule/Send
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-[48px_1fr] items-center gap-3">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">To</span>
                  <div className="rounded-md border bg-muted/40 p-2 text-xs">
                    Nordic Tier-1 Firms, Boutique Interior Leads
                  </div>
                </div>
                <div className="grid grid-cols-[48px_1fr] items-center gap-3">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">Sub</span>
                  <Input value="New Opportunities: Architect Ledger Partnership Proposal" readOnly />
                </div>
              </div>
            </CardHeader>
            <CardContent className="prose prose-sm max-w-none py-6 dark:prose-invert">
              <p>Dear {"{First_Name}"},</p>
              <p>
                I have been following {"{Company_Name}"}&apos;s recent expansion into adaptive reuse projects,
                and I was particularly struck by your approach to the Stockholm Waterfront renovation.
              </p>
              <p>
                We&apos;ve built <strong>Architect Ledger</strong> specifically for firms like yours—reducing technical
                overhead by 40% so your team can focus on architectural narrative rather than administrative friction.
              </p>
              <p>
                I&apos;d love to show you how our high-tier outreach module can integrate with your existing workflow.
                Are you available for a brief call next Thursday at 2 PM CEST?
              </p>
              <p>
                Best regards,
                <br />
                <strong>Alex Mercer</strong>
                <br />
                Partnership Lead | Architect Ledger
              </p>
              <div className="pt-4 text-xs uppercase tracking-wider text-muted-foreground">
                Word Count: 142 • Estimated Read Time: 45s • Deliverability: High (98%)
              </div>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
};

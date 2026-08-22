import { useEffect, useState } from "react";
import { FleetOSLayout } from "@/components/layout/FleetOSLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { fetchFleetContacts, type FleetContactSummary } from "@/application/queries/fleet.query";
import {
  Users,
  Search,
  Plus,
  Mail,
  Phone,
  Shield,
  Receipt,
  FileText,
  Building2,
} from "lucide-react";
import { AddContactDialog } from "@/components/fleet/AddContactDialog";

const FleetContactsPage = () => {
  const [contacts, setContacts] = useState<FleetContactSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const loadContacts = async () => {
    try {
      const data = await fetchFleetContacts();
      setContacts(data);
    } catch (err) {
      console.error("[FleetContactsPage] Error loading contacts:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContacts();
  }, []);

  const filtered = contacts.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.role?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.fleet_clients?.company_name?.toLowerCase().includes(q)
    );
  });

  const roleColors: Record<string, string> = {
    "Fleet Manager": "bg-blue-500/10 text-blue-600",
    "Billing Department": "bg-purple-500/10 text-purple-600",
    "Regional Ops Manager": "bg-amber-500/10 text-amber-600",
    "Site Supervisor": "bg-emerald-500/10 text-emerald-600",
  };

  return (
    <FleetOSLayout title="Contacts">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {contacts.length} contact{contacts.length !== 1 ? "s" : ""} across fleet accounts
          </p>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add Contact
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, role, email, or company..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Contact List */}
        {loading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading contacts...</p>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Users className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="font-medium">No contacts yet</p>
              <p className="text-sm text-muted-foreground mt-1 mb-4">
                Add contacts via client profiles or directly here
              </p>
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Add Contact
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((c) => (
              <Card
                key={c.id}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{c.name}</p>
                        {c.role && (
                          <Badge variant="secondary" className={roleColors[c.role] || "bg-muted text-muted-foreground"}>
                            {c.role}
                          </Badge>
                        )}
                        {c.is_primary && (
                          <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px]">
                            Primary
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                        {c.fleet_clients?.company_name && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" /> {c.fleet_clients.company_name}
                          </span>
                        )}
                        {c.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" /> {c.email}
                          </span>
                        )}
                        {c.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {c.phone}
                          </span>
                        )}
                      </div>
                      {/* Permission tags */}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {c.can_approve_work && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                            <Shield className="h-2.5 w-2.5" /> Approve Work
                          </span>
                        )}
                        {c.receives_invoices && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-purple-600 bg-purple-500/10 px-2 py-0.5 rounded-md">
                            <Receipt className="h-2.5 w-2.5" /> Receives Invoices
                          </span>
                        )}
                        {c.receives_reports && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-blue-600 bg-blue-500/10 px-2 py-0.5 rounded-md">
                            <FileText className="h-2.5 w-2.5" /> Receives Reports
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
      <AddContactDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={() => loadContacts()}
      />
    </FleetOSLayout>
  );
};

export default FleetContactsPage;

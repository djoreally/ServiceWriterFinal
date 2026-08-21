import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { FleetOSLayout } from "@/components/layout/FleetOSLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchFleetClients, type FleetClientSummary } from "@/application/queries";
import { Building2, Plus, Phone, Mail, ChevronRight, Upload } from "lucide-react";
import { FleetImportDialog } from "@/components/fleet/FleetImportDialog";
import { useAuth } from "@packages/auth";
import {
  validateClientRows,
  importFleetClients,
  CLIENT_IMPORT_COLUMNS,
} from "@/application/commands/fleet-import.command";

const FleetClients = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [clients, setClients] = useState<FleetClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);

  const loadClients = useCallback(async () => {
    try {
      const data = await fetchFleetClients();
      setClients(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const paymentTermsLabel: Record<string, string> = {
    due_on_receipt: "Due on Receipt",
    net_15: "Net 15",
    net_30: "Net 30",
    net_45: "Net 45",
    net_60: "Net 60",
  };

  return (
    <FleetOSLayout title="Fleet Clients">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{clients.length} client{clients.length !== 1 ? "s" : ""}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4 mr-1" /> Import CSV
            </Button>
            <Button size="sm" onClick={() => navigate("/fleet-os/clients/new")}>
              <Plus className="h-4 w-4 mr-1" /> Add Client
            </Button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : clients.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="font-medium">No fleet clients yet</p>
              <p className="text-sm text-muted-foreground mt-1 mb-4">Add your first fleet client to get started</p>
              <Button size="sm" onClick={() => navigate("/fleet-os/clients/new")}>
                <Plus className="h-4 w-4 mr-1" /> Add Client
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {clients.map((client) => (
              <Card
                key={client.id}
                className="cursor-pointer hover:border-primary/30 transition-colors"
                onClick={() => navigate(`/fleet-os/clients/${client.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-primary shrink-0" />
                        <p className="font-medium truncate">{client.company_name}</p>
                        <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${
                          client.status === "active" ? "bg-gray-500/10 text-gray-500" : "bg-muted text-muted-foreground"
                        }`}>
                          {client.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
                        {client.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {client.phone}
                          </span>
                        )}
                        {client.billing_email && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" /> {client.billing_email}
                          </span>
                        )}
                        <span>{paymentTermsLabel[client.payment_terms] || client.payment_terms}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right text-xs text-muted-foreground hidden sm:block">
                        <p>{client.fleet_vehicles?.length ?? 0} vehicles</p>
                        <p>{client.fleet_work_orders?.length ?? 0} work orders</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Import dialog */}
      <FleetImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import Fleet Clients"
        description="Upload a CSV or Excel file to bulk-import fleet clients. Download the template for the expected format."
        templateColumns={CLIENT_IMPORT_COLUMNS}
        templateFileName="fleet-clients-template.csv"
        onValidate={(rows) => validateClientRows(rows)}
        onImport={(validRows) => importFleetClients(user!.id, validRows)}
        onComplete={loadClients}
      />
    </FleetOSLayout>
  );
};

export default FleetClients;

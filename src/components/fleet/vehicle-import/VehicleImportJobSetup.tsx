import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchFleetClients, fetchFleetLocations } from "@/application/queries";
import { createFleetClient } from "@/application/commands/fleet-client.command";
import type { ImportJobSetup, VehicleImportBatch } from "@/features/vehicle-import/types";

const SERVICE_PACKAGES: Array<{
  code: string;
  label: string;
  price: number;
  minutes: number;
  includes: string[];
}> = [
  { code: "fleet_full_synthetic_oil", label: "Full synthetic oil change", price: 109, minutes: 45, includes: ["Oil + filter", "Multi-point inspection", "Fluid top-off"] },
  { code: "fleet_conventional_oil", label: "Conventional oil change", price: 79, minutes: 40, includes: ["Oil + filter", "Multi-point inspection"] },
  { code: "fleet_diesel_oil", label: "Diesel oil service", price: 189, minutes: 70, includes: ["Diesel oil + filter", "Fuel filter check", "Inspection"] },
  { code: "fleet_pm_service", label: "Preventive maintenance (PM-A)", price: 149, minutes: 60, includes: ["Oil + filter", "Filters", "Full PM checklist"] },
];

interface VehicleImportJobSetupProps {
  batch: VehicleImportBatch;
  onBack: () => void;
  onContinue: (setup: ImportJobSetup) => void;
  initialClientId?: string | null;
}

export function VehicleImportJobSetup({ batch, onBack, onContinue, initialClientId }: VehicleImportJobSetupProps) {
  const [clients, setClients] = useState<Array<{ id: string; company_name: string }>>([]);
  const [locations, setLocations] = useState<Array<{ id: string; fleet_client_id?: string | null; name: string | null; city: string | null }>>([]);
  const [clientId, setClientId] = useState<string | null>(batch.jobSetup?.fleetClientId ?? initialClientId ?? null);
  const [newClientName, setNewClientName] = useState(batch.sheetTitle ?? "");
  const [creatingClient, setCreatingClient] = useState(false);
  const [locationId, setLocationId] = useState<string | null>(batch.jobSetup?.fleetLocationId ?? null);
  const [packageCode, setPackageCode] = useState<string>(batch.jobSetup?.servicePackageCode ?? SERVICE_PACKAGES[0].code);
  const [price, setPrice] = useState<string>(String(batch.jobSetup?.servicePackagePrice ?? SERVICE_PACKAGES[0].price));
  const [scheduledDate, setScheduledDate] = useState(batch.jobSetup?.scheduledDate ?? "");
  const [scheduledTime, setScheduledTime] = useState(batch.jobSetup?.scheduledTime ?? "08:00");
  const [poNumber, setPoNumber] = useState(batch.jobSetup?.poNumber ?? "");
  const [notes, setNotes] = useState(batch.jobSetup?.notes ?? "");

  useEffect(() => {
    void fetchFleetClients()
      .then((rows) => setClients(rows.map((row) => ({ id: row.id, company_name: row.company_name }))))
      .catch(() => setClients([]));
    void fetchFleetLocations()
      .then((rows) => setLocations(rows.map((row) => ({ id: row.id, fleet_client_id: row.fleet_client_id, name: row.name, city: row.city }))))
      .catch(() => setLocations([]));
  }, []);

  const selectedPackage = useMemo(
    () => SERVICE_PACKAGES.find((entry) => entry.code === packageCode) ?? SERVICE_PACKAGES[0],
    [packageCode],
  );
  const clientLocations = useMemo(
    () => locations.filter((location) => !clientId || !location.fleet_client_id || location.fleet_client_id === clientId),
    [clientId, locations],
  );

  const handleCreateClient = async () => {
    if (!newClientName.trim()) return;
    setCreatingClient(true);
    try {
      const created = await createFleetClient(
        batch.createdBy,
        { company_name: newClientName.trim() } as never,
        [],
      );
      const id = (created as { id?: string } | undefined)?.id;
      const rows = await fetchFleetClients();
      setClients(rows.map((row) => ({ id: row.id, company_name: row.company_name })));
      setClientId(id ?? rows.find((row) => row.company_name === newClientName.trim())?.id ?? null);
    } finally {
      setCreatingClient(false);
    }
  };

  const submit = () => {
    onContinue({
      fleetClientId: clientId,
      fleetClientName: clients.find((entry) => entry.id === clientId)?.company_name ?? null,
      fleetLocationId: locationId,
      fleetContractId: null,
      serviceRuleId: null,
      servicePackageCode: selectedPackage.code,
      servicePackageLabel: selectedPackage.label,
      servicePackagePrice: Number(price) || selectedPackage.price,
      servicePackageDurationMinutes: selectedPackage.minutes,
      servicePackageIncludes: selectedPackage.includes,
      scheduledDate: scheduledDate || null,
      scheduledTime: scheduledTime || null,
      technicianId: null,
      poNumber: poNumber.trim() || null,
      billingMethod: null,
      notes: notes.trim() || null,
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Job setup</CardTitle>
          <CardDescription>
            {batch.parsedRows} vehicle rows detected{batch.droppedRows ? ` (${batch.droppedRows} non-vehicle rows ignored)` : ""}.
            Select the client once — it is applied to every vehicle in this list. Service job details are optional and can be used after import.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Fleet client</Label>
              <Select value={clientId ?? ""} onValueChange={(value) => setClientId(value)}>
                <SelectTrigger><SelectValue placeholder="Select a client" /></SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>{client.company_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!clientId && (
                <div className="flex gap-2">
                  <Input
                    value={newClientName}
                    onChange={(event) => setNewClientName(event.target.value)}
                    placeholder="Or create a new client"
                  />
                  <Button variant="outline" onClick={handleCreateClient} disabled={creatingClient || !newClientName.trim()}>
                    {creatingClient ? "Creating..." : "Create"}
                  </Button>
                </div>
              )}
              {batch.sheetTitle && (
                <p className="text-xs text-muted-foreground">Suggested from the sheet title: {batch.sheetTitle}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Service location</Label>
              <Select value={locationId ?? ""} onValueChange={(value) => setLocationId(value)}>
                <SelectTrigger><SelectValue placeholder="Select a location (optional)" /></SelectTrigger>
                <SelectContent>
                  {clientLocations.map((location) => (
                    <SelectItem key={location.id} value={location.id}>
                      {location.name || "Location"}{location.city ? ` — ${location.city}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Optional service package</Label>
              <Select
                value={packageCode}
                onValueChange={(value) => {
                  setPackageCode(value);
                  const next = SERVICE_PACKAGES.find((entry) => entry.code === value);
                  if (next) setPrice(String(next.price));
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SERVICE_PACKAGES.map((entry) => (
                    <SelectItem key={entry.code} value={entry.code}>{entry.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex flex-wrap gap-1">
                {selectedPackage.includes.map((item) => (
                  <Badge key={item} variant="secondary" className="text-[11px]">{item}</Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Price per vehicle</Label>
              <Input type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} />
              <p className="text-xs text-muted-foreground">
                Estimated batch total: ${((Number(price) || 0) * batch.parsedRows).toFixed(2)} across {batch.parsedRows} vehicles
              </p>
            </div>

            <div className="space-y-2">
              <Label>Service date</Label>
              <Input type="date" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Start time</Label>
              <Input type="time" value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>PO number</Label>
              <Input value={poNumber} onChange={(event) => setPoNumber(event.target.value)} placeholder="Optional" />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Job notes</Label>
              <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Gate codes, contact on site, sequencing..." />
            </div>
          </div>

          {batch.footnotes && batch.footnotes.length > 0 && (
            <div className="rounded border bg-muted/40 p-3">
              <p className="text-xs font-medium">Notes captured from the source list</p>
              <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                {batch.footnotes.map((line) => <li key={line}>• {line}</li>)}
              </ul>
            </div>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={onBack}>Back</Button>
            <Button onClick={submit} disabled={!clientId}>Continue to column mapping</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

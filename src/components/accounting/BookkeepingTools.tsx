"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Calculator, Car, RefreshCw, Save, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MAPBOX_ACCESS_TOKEN } from "@/lib/mapbox";
import { answerBookQuestion, routeMiles, type BookFacts } from "@/features/accounting/book-tools";
import {
  fetchBookkeepingSettings,
  fetchMileageCandidates,
  fetchMileageTrips,
  saveBookkeepingSettings,
  saveMileageTrip,
  type BookkeepingSettings,
  type MileageTrip,
} from "@/application/queries/mileage.query";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";

export function BookkeepingTools({ facts }: { facts: Omit<BookFacts, "mileageMiles" | "mileageDeduction" | "minimumCashReserve"> }) {
  const { formatCurrency } = useRegionalSettings();
  const [settings, setSettings] = useState<BookkeepingSettings>({
    mileage_enabled: true,
    mileage_round_trip: true,
    mileage_rate_per_mile: 0,
    minimum_cash_reserve: 0,
  });
  const [trips, setTrips] = useState<MileageTrip[]>([]);
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);

  const mileageMiles = useMemo(() => trips.filter((t) => t.status !== "excluded").reduce((sum, t) => sum + Number(t.total_miles || 0), 0), [trips]);
  const mileageDeduction = useMemo(() => trips.filter((t) => t.status !== "excluded").reduce((sum, t) => sum + Number(t.deductible_value || 0), 0), [trips]);

  const allFacts: BookFacts = {
    ...facts,
    mileageMiles,
    mileageDeduction,
    minimumCashReserve: settings.minimum_cash_reserve,
  };

  const load = async () => {
    const [nextSettings, nextTrips] = await Promise.all([
      fetchBookkeepingSettings(),
      fetchMileageTrips(),
    ]);
    setSettings(nextSettings);
    setTrips(nextTrips);
  };

  useEffect(() => {
    void load().catch((error) => {
      console.error(error);
      toast.error("Unable to load bookkeeping tools.");
    });
  }, []);

  const syncMileage = async () => {
    setBusy(true);
    try {
      const source = await fetchMileageCandidates();
      if (!source.businessCoordinates) throw new Error("Set the business/service address coordinates in Settings before calculating mileage.");
      const existing = new Set(trips.map((trip) => trip.appointment_id).filter(Boolean));
      let created = 0;
      for (const appointment of source.appointments) {
        if (existing.has(appointment.id) || appointment.location_lat == null || appointment.location_lng == null) continue;
        const destination = { lat: appointment.location_lat, lng: appointment.location_lng };
        const distance = await routeMiles(source.businessCoordinates, destination, MAPBOX_ACCESS_TOKEN);
        const totalMiles = distance.miles * (settings.mileage_round_trip ? 2 : 1);
        await saveMileageTrip({
          appointmentId: appointment.id,
          tripDate: appointment.starts_at.slice(0, 10),
          originAddress: source.businessAddress,
          destinationAddress: appointment.location_address || "",
          origin: source.businessCoordinates,
          destination,
          oneWayMiles: distance.miles,
          totalMiles,
          mileageRate: settings.mileage_rate_per_mile,
          method: distance.method,
        });
        created += 1;
      }
      await load();
      toast.success(created ? `Tracked mileage for ${created} completed job${created === 1 ? "" : "s"}.` : "Mileage is already up to date.");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Mileage sync failed.");
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async () => {
    setBusy(true);
    try {
      await saveBookkeepingSettings(settings);
      toast.success("Bookkeeping settings saved.");
    } catch (error) {
      console.error(error);
      toast.error("Could not save bookkeeping settings.");
    } finally {
      setBusy(false);
    }
  };

  const ask = () => {
    const result = answerBookQuestion(question, allFacts);
    setAnswer(result.formula ? `${result.answer} Formula: ${result.formula}.` : result.answer);
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2"><Car className="h-5 w-5" /> Job Mileage</CardTitle>
          <p className="text-sm text-muted-foreground">
            Completed mobile jobs are measured from the workspace service address to the saved job coordinates. Road miles use Mapbox when available; fallback mileage is flagged for review.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted/50 p-4">
              <p className="text-[10px] font-bold uppercase text-muted-foreground">Business miles</p>
              <p className="text-2xl font-black">{mileageMiles.toFixed(1)}</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-4">
              <p className="text-[10px] font-bold uppercase text-muted-foreground">Mileage value</p>
              <p className="text-2xl font-black">{formatCurrency(mileageDeduction)}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold">
              Mileage rate per mile
              <Input
                className="mt-1"
                type="number"
                min="0"
                step="0.001"
                value={settings.mileage_rate_per_mile}
                onChange={(event) => setSettings((s) => ({ ...s, mileage_rate_per_mile: Number(event.target.value) || 0 }))}
              />
            </label>
            <label className="text-xs font-semibold">
              Minimum operating reserve
              <Input
                className="mt-1"
                type="number"
                min="0"
                step="1"
                value={settings.minimum_cash_reserve}
                onChange={(event) => setSettings((s) => ({ ...s, minimum_cash_reserve: Number(event.target.value) || 0 }))}
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.mileage_round_trip}
              onChange={(event) => setSettings((s) => ({ ...s, mileage_round_trip: event.target.checked }))}
            />
            Count business → job → business as round trip
          </label>
          <div className="flex flex-wrap gap-2">
            <Button onClick={syncMileage} disabled={busy || !settings.mileage_enabled}>
              <RefreshCw className="mr-2 h-4 w-4" /> Sync completed jobs
            </Button>
            <Button variant="outline" onClick={saveSettings} disabled={busy}>
              <Save className="mr-2 h-4 w-4" /> Save settings
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Service Writer stores the route basis, origin/destination, miles, method, rate, and appointment link for auditability.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5" /> Ask My Books</CardTitle>
          <p className="text-sm text-muted-foreground">
            Not AI. Questions are matched to fixed bookkeeping formulas and the current ledger. Unsupported questions are refused instead of guessed.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") ask(); }}
              placeholder="How much did I spend? Can I safely take money out?"
            />
            <Button onClick={ask}><Search className="h-4 w-4" /></Button>
          </div>
          {answer ? <div className="rounded-lg border bg-muted/30 p-4 text-sm leading-6">{answer}</div> : null}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              "How much revenue did I make?",
              "Where did my money go?",
              "How much did I pay myself?",
              "How much investor money came in?",
              "How many transactions are unresolved?",
              "How many business miles did I drive?",
              "What is my operating reserve?",
              "Can I safely take money out?",
            ].map((sample) => (
              <button
                type="button"
                key={sample}
                onClick={() => {
                  setQuestion(sample);
                  const result = answerBookQuestion(sample, allFacts);
                  setAnswer(result.formula ? `${result.answer} Formula: ${result.formula}.` : result.answer);
                }}
                className="rounded-md border p-2 text-left hover:bg-muted"
              >
                {sample}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

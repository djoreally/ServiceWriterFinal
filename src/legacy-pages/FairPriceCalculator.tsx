import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowRight, Loader2, Scale, Search, ShieldAlert, Wrench } from "lucide-react";
import {
  fetchVehicleRepairs,
  VehicleRepairsUnavailableError,
  type RepairItem,
} from "@/application/queries/vehicle-repairs.query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  MarketingLayout,
  PageHeader,
  NeoCard,
  neoBtn,
  hardShadow,
  hardShadowLg,
  monoStack,
  PRIMARY,
} from "@/components/marketing/MarketingLayout";

type LookupError = {
  title: string;
  message: string;
};

export default function FairPriceCalculator() {
  const [vin, setVin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<LookupError | null>(null);
  const [repairs, setRepairs] = useState<RepairItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRepair, setSelectedRepair] = useState<RepairItem | null>(null);

  const handleLookup = async (event: FormEvent) => {
    event.preventDefault();
    const cleanVin = vin.replace(/\s/g, "").toUpperCase();
    if (cleanVin.length !== 17) {
      toast.error("Enter a valid 17-character VIN.");
      return;
    }

    setLoading(true);
    setError(null);
    setRepairs([]);
    setSelectedRepair(null);

    try {
      const response = await fetchVehicleRepairs(cleanVin);
      if (!response.success || !response.repair?.length) {
        setError({
          title: "No estimates available for this vehicle",
          message: "We could not find enough current pricing information for this VIN. You can try another VIN or contact our team for help.",
        });
        return;
      }
      setRepairs(response.repair);
      setSelectedRepair(response.repair[0]);
      toast.success("Repair estimates loaded.");
    } catch (lookupError: unknown) {
      setError(
        lookupError instanceof VehicleRepairsUnavailableError
          ? {
              title: "Pricing estimates are temporarily unavailable",
              message: "Our pricing data service is unavailable right now. No estimate was calculated. Please try again later or contact us for help.",
            }
          : {
              title: "We could not load repair estimates",
              message: "No estimate was calculated. Check the VIN and try again, or contact us if the issue continues.",
            },
      );
    } finally {
      setLoading(false);
    }
  };

  const filteredRepairs = repairs.filter((item) =>
    item.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const getCost = (
    item: RepairItem,
    type: "independent" | "dealer",
    name: "part" | "labor" | "total",
  ) => item.costs[type].find((cost) => cost.name === name);

  return (
    <MarketingLayout>
      <PageHeader
        eyebrow="Pricing research tool"
        title="Auto Repair Fair-Price Calculator"
        subtitle="Use a 17-character VIN to request available repair-price ranges. Estimates are informational only and should be confirmed with current local quotes."
      />

      <div className="mx-auto mb-16 max-w-2xl">
        <form onSubmit={handleLookup} className="space-y-4 border-[4px] border-black bg-white p-6 md:p-8" style={hardShadowLg} noValidate>
          <div className="space-y-2">
            <Label htmlFor="vin" className="text-sm font-bold uppercase tracking-widest" style={monoStack}>
              Enter 17-character VIN
            </Label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                id="vin"
                type="text"
                placeholder="e.g., 1GTP9EED7KZ309069"
                value={vin}
                onChange={(event) => setVin(event.target.value.toUpperCase())}
                maxLength={17}
                autoComplete="off"
                aria-describedby="vin-help"
                className="h-12 rounded-none border-[3px] border-black font-mono text-lg uppercase"
              />
              <button
                type="submit"
                disabled={loading}
                className={`${neoBtn} h-12 flex-shrink-0 bg-black px-6 text-white`}
                style={{ backgroundColor: PRIMARY, color: "#fff", ...hardShadow }}
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading repair estimates" /> : <>Check available estimates <ArrowRight className="ml-2 w-5" /></>}
              </button>
            </div>
            <p id="vin-help" className="text-xs text-muted-foreground">
              Don&apos;t have a VIN? You can try this published example: <code className="bg-muted p-1 font-mono text-primary">1GTP9EED7KZ309069</code>
            </p>
          </div>
        </form>
      </div>

      {loading ? (
        <div className="py-12 text-center" role="status" aria-live="polite">
          <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-primary" aria-hidden="true" />
          <p className="text-lg font-bold">Checking available repair-price ranges…</p>
        </div>
      ) : error ? (
        <section className="mx-auto max-w-lg border-[4px] border-black bg-white p-8 text-center" style={hardShadow} role="alert" aria-live="assertive">
          <AlertCircle className="mx-auto mb-3 h-12 w-12 text-red-600" aria-hidden="true" />
          <h2 className="mb-1 text-xl font-black">{error.title}</h2>
          <p className="mb-5 text-sm text-muted-foreground">{error.message}</p>
          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <Button variant="outline" className="rounded-none border-2 border-black" onClick={() => setError(null)}>Try another VIN</Button>
            <Button asChild className="rounded-none"><Link to="/contact">Contact us</Link></Button>
          </div>
        </section>
      ) : repairs.length > 0 ? (
        <section className="mb-16 grid grid-cols-1 gap-8 lg:grid-cols-3" aria-label="Repair price estimates">
          <div className="flex max-h-[500px] flex-col border-[4px] border-black bg-white" style={hardShadow}>
            <div className="border-b-[3px] border-black bg-muted/30 p-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input placeholder="Filter repairs" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="rounded-none border-2 border-black pl-9" aria-label="Filter repair estimates" />
              </div>
            </div>
            <div className="flex-1 divide-y-2 divide-black overflow-y-auto">
              {filteredRepairs.map((item) => {
                const isSelected = selectedRepair?.title === item.title;
                return (
                  <button key={item.title} type="button" onClick={() => setSelectedRepair(item)} className={`flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-primary/5 ${isSelected ? "bg-primary/5 font-bold" : ""}`} aria-pressed={isSelected}>
                    <span className="truncate text-sm">{item.title}</span>
                    <ArrowRight className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-6 lg:col-span-2">
            {selectedRepair && (
              <article className="border-[4px] border-black bg-white p-6 md:p-8" style={hardShadow}>
                <div className="mb-4 flex flex-wrap items-start justify-between gap-4 border-b-2 border-black pb-4">
                  <div>
                    <h2 className="text-2xl font-black">{selectedRepair.title}</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">Informational market-price ranges</p>
                  </div>
                  <Badge variant="outline" className="rounded-none border-2 border-black text-xs">Estimate only</Badge>
                </div>
                {selectedRepair.description && selectedRepair.description !== "N/A" && <p className="mb-6 border-l-4 border-black bg-muted/30 p-4 text-sm text-muted-foreground">{selectedRepair.description}</p>}
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  {(["independent", "dealer"] as const).map((type) => (
                    <div key={type} className="space-y-3 border-[3px] border-black p-4">
                      <h3 className="flex items-center gap-1.5 border-b-2 border-black pb-2 text-sm font-bold uppercase">
                        {type === "independent" ? <Scale className="h-4 w-4 text-primary" aria-hidden="true" /> : <ShieldAlert className="h-4 w-4 text-orange-500" aria-hidden="true" />}
                        {type === "independent" ? "Independent shop range" : "Dealership range"}
                      </h3>
                      {(["part", "labor", "total"] as const).map((name) => {
                        const cost = getCost(selectedRepair, type, name);
                        if (!cost) return null;
                        return <div key={name} className="text-sm"><div className="flex justify-between font-bold"><span className="capitalize">{name} estimate</span><span>${cost.average}</span></div><div className="flex justify-between text-[10px] text-muted-foreground"><span>Low: ${cost.low}</span><span>High: ${cost.high}</span></div></div>;
                      })}
                    </div>
                  ))}
                </div>
              </article>
            )}

            <NeoCard className="space-y-3">
              <Wrench className="h-8 w-8 text-primary" aria-hidden="true" />
              <h2 className="text-xl font-black">Confirm your local quote</h2>
              <p className="text-sm text-muted-foreground">Repair pricing varies with labor, parts availability, taxes, diagnostics, and local market conditions. Ask a qualified provider for a current written estimate before authorizing work.</p>
              <Button asChild variant="outline" className="rounded-none border-2 border-black"><Link to="/find-provider">Find a provider <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></Link></Button>
            </NeoCard>
          </div>
        </section>
      ) : (
        <NeoCard className="mx-auto max-w-xl text-center">
          <Wrench className="mx-auto mb-3 h-10 w-10 text-primary" aria-hidden="true" />
          <h2 className="text-xl font-black">Check available repair-price ranges</h2>
          <p className="text-sm text-muted-foreground">Enter a VIN above to request informational ranges. We will clearly tell you if pricing data is unavailable.</p>
        </NeoCard>
      )}
    </MarketingLayout>
  );
}

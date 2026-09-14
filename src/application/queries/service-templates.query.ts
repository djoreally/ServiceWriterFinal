/**
 * Service Library starter catalog.
 *
 * This is product reference data, not tenant data. Keeping the starter catalog
 * in code avoids recreating the retired public.service_templates schema and
 * lets each shop copy only the services it actually offers into service_catalog.
 */
export interface ServiceTemplate {
  id: string;
  name: string;
  categoryId: string | null;
  description: string | null;
  defaultPrice: number;
  suggestedPrice: string;
  laborRate: number | null;
  durationMinutes: number | null;
  durationLabel: string;
  skillLevel: string | null;
  notes: string | null;
  serviceVertical: "general" | "detailing" | "tires";
  pricingMode: "flat" | "labor_parts" | "detailing_assessment" | "tire_inventory" | "quote_required";
  serviceIntent: string | null;
  requiresTireQuantity: boolean;
  requiresFitmentLookup: boolean;
  requiresInventorySelection: boolean;
  allowsManualFitment: boolean;
  isUpsell: boolean;
  sortOrder: number;
}

export interface TemplateCategory {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
}

const CATEGORIES: TemplateCategory[] = [
  { id: "automotive", name: "Automotive", parentId: null, sortOrder: 10 },
  { id: "detailing", name: "Detailing", parentId: null, sortOrder: 20 },
  { id: "tire", name: "Tire", parentId: null, sortOrder: 30 },
  { id: "fleet_mobile", name: "Fleet / Mobile-Specific", parentId: null, sortOrder: 40 },
];

type Seed = [string, string, string, string, number, string, number | null];
const A: Seed[] = [
["standard-oil-change","Standard Oil Change","Conventional oil and filter replacement, fluid top-off, visual inspection","$45–$65",55,"30 min",30],
["synthetic-oil-change","Synthetic Oil Change","Full synthetic oil and filter replacement, fluid top-off, visual inspection","$70–$95",82.5,"30 min",30],
["multi-point-inspection","Multi-Point Inspection","Visual check of brakes, tires, fluids, belts, hoses, and lights","$0–$30",15,"20 min",20],
["brake-pad-replacement","Brake Pad Replacement (per axle)","Remove worn pads, inspect rotors/calipers, install new pads","$150–$250",200,"60–90 min",75],
["brake-rotor-pad-replacement","Brake Rotor & Pad Replacement (per axle)","Full brake job including rotor resurfacing or replacement","$250–$450",350,"90–120 min",105],
["battery-replacement","Battery Replacement","Test, remove old battery, install new, terminal cleaning","$150–$250",200,"20–30 min",25],
["battery-test-charge","Battery Test & Charge","Load test battery and charging system, top-off charge","$20–$40",30,"20 min",20],
["alternator-replacement","Alternator Replacement","Diagnose, remove, and replace alternator; test charging output","$350–$600",475,"90–120 min",105],
["starter-replacement","Starter Replacement","Diagnose, remove, and replace starter motor","$300–$550",425,"90–120 min",105],
["check-engine-diagnostic","Check Engine Light Diagnostic","Scan for codes, road test, diagnostic report","$50–$100",75,"30–45 min",40],
["serpentine-belt","Serpentine Belt Replacement","Remove old belt, inspect pulleys/tensioner, install new belt","$100–$180",140,"45–60 min",55],
["coolant-flush","Coolant Flush & Fill","Drain old coolant, flush system, refill with correct coolant type","$100–$150",125,"45 min",45],
["transmission-fluid","Transmission Fluid Service","Drain and refill transmission fluid, filter replacement if applicable","$150–$250",200,"60 min",60],
["spark-plugs","Spark Plug Replacement","Remove and replace spark plugs, inspect ignition coils","$120–$300",210,"45–90 min",70],
["air-filter","Air Filter Replacement","Replace engine air filter and cabin air filter","$30–$60",45,"15 min",15],
["wiper-blades","Wiper Blade Replacement","Install new front (and rear, if applicable) wiper blades","$25–$50",37.5,"10 min",10],
["pre-purchase-inspection","Pre-Purchase Inspection","Comprehensive mechanical inspection for a used vehicle purchase","$100–$175",137.5,"60–90 min",75],
];
const D: Seed[] = [
["exterior-wash","Exterior Wash & Dry","Hand wash, wheel cleaning, tire dressing, hand dry","$25–$45",35,"30–45 min",40],
["interior-vacuum","Interior Vacuum & Wipe-Down","Full interior vacuum, dashboard/console wipe-down, window cleaning","$30–$50",40,"30–45 min",40],
["full-detail","Full Interior/Exterior Detail","Complete wash, vacuum, wipe-down, tire shine, window cleaning inside and out","$100–$180",140,"2–3 hrs",150],
["interior-deep-clean","Interior Deep Clean","Steam cleaning of seats/carpets, stain treatment, full sanitizing wipe-down","$150–$250",200,"2–4 hrs",180],
["clay-bar-wax","Clay Bar & Wax","Clay bar treatment to remove contaminants, followed by hand wax","$120–$200",160,"1.5–2.5 hrs",120],
["paint-sealant","Paint Sealant Application","Synthetic sealant applied for extended paint protection","$100–$180",140,"1–1.5 hrs",75],
["ceramic-coating","Ceramic Coating (1-Year)","Ceramic coating application for gloss and long-term protection","$400–$700",550,"4–6 hrs",300],
["headlight-restoration","Headlight Restoration","Sand and polish oxidized headlights, apply UV-protective sealant","$60–$100",80,"45–60 min",55],
["engine-bay-detail","Engine Bay Detail","Degrease and clean engine bay, dress hoses and plastics","$50–$90",70,"45 min",45],
["pet-hair","Pet Hair Removal","Specialized removal of embedded pet hair from seats and carpets","$40–$80",60,"45–60 min",55],
["odor-treatment","Odor Elimination Treatment","Ozone or enzyme treatment to neutralize persistent odors","$75–$150",112.5,"1–2 hrs",90],
];
const T: Seed[] = [
["tire-rotation","Tire Rotation","Rotate all four tires per manufacturer pattern","$25–$45",35,"30 min",30],
["tire-balancing","Tire Balancing (per tire)","Wheel balancing to eliminate vibration","$15–$25",20,"15 min",15],
["flat-repair","Flat Tire Repair","Patch or plug puncture, remount and balance","$25–$45",35,"30 min",30],
["mount-balance","Tire Mounting & Balancing (per tire)","Mount new tire on wheel, balance, and install","$25–$40",32.5,"20 min",20],
["new-tire-install","New Tire Installation (set of 4)","Mount, balance, and install four new tires, dispose of old tires","$100–$180 (labor only)",140,"60–90 min",75],
["tpms","Tire Pressure Monitoring System (TPMS) Service","Reset or replace TPMS sensor, relearn procedure","$40–$80",60,"30 min",30],
["alignment-2","Wheel Alignment (2-wheel)","Front-end alignment adjustment","$60–$90",75,"45 min",45],
["alignment-4","Wheel Alignment (4-wheel)","Full four-wheel alignment adjustment","$90–$140",115,"60 min",60],
["seasonal-swap","Seasonal Tire Swap","Swap between summer/all-season and winter tire sets, includes storage tag","$40–$70",55,"45 min",45],
["tread-check","Tire Inspection & Tread Check","Measure tread depth, check for uneven wear and damage","$0–$20",10,"15 min",15],
];
const F: Seed[] = [
["mobile-oil-change","Mobile Oil Change (On-Site)","On-location oil and filter change at customer's home, office, or fleet yard","$60–$90",75,"30–45 min",40],
["fleet-inspection","Fleet Vehicle Inspection (per vehicle)","DOT-style or company-standard multi-point inspection performed on-site","$40–$75",57.5,"30–45 min",40],
["fleet-pm","Fleet Preventive Maintenance Package","Bundled oil change, fluid top-off, and inspection across a fleet visit","Custom / per-fleet pricing",0,"Varies by fleet size",null],
["onsite-battery","On-Site Battery Replacement","Test and replace battery at customer location","$170–$270",220,"30–40 min",35],
["mobile-brakes","Mobile Brake Service","On-site brake pad/rotor replacement at customer location","$200–$400",300,"90–120 min",105],
["jump-start","Roadside Jump Start","Emergency on-site battery jump start","$40–$75",57.5,"15–20 min",20],
["mobile-tire","Mobile Tire Change/Repair","On-site flat repair or spare/tire swap","$50–$90",70,"30 min",30],
["fleet-onboarding","Fleet Onboarding Inspection","Baseline inspection for a new vehicle entering a fleet program","$60–$100",80,"45–60 min",55],
["maintenance-contract","Recurring Maintenance Contract (per vehicle/month)","Scheduled recurring service visits billed monthly per vehicle","Custom / negotiated",0,"Varies",null],
["emergency-mobile","Emergency Mobile Service Call","Priority on-site diagnostic and repair dispatch outside standard schedule","$100–$150 service fee + repair cost",125,"Varies",null],
];

function build(seeds: Seed[], categoryId: string, vertical: ServiceTemplate["serviceVertical"], start: number): ServiceTemplate[] {
  return seeds.map(([id,name,description,suggestedPrice,defaultPrice,durationLabel,durationMinutes], i) => {
    const tire = vertical === "tires";
    const intent = tire ? (id.includes("rotation") || id === "seasonal-swap" ? "rotation" : id.includes("balance") ? "balance" : id === "flat-repair" ? "repair" : id === "tpms" ? "tpms" : id.includes("alignment") ? "alignment" : id === "tread-check" ? "wheel_service" : "replacement") : null;
    const inventory = tire && (id === "new-tire-install" || id === "mount-balance");
    return {
      id: `starter-${categoryId}-${id}`, name, categoryId, description, defaultPrice, suggestedPrice,
      laborRate: null, durationMinutes, durationLabel, skillLevel: null,
      notes: `Suggested price: ${suggestedPrice}. Adjust price and duration to match local market rates and your actual costs before publishing.`,
      serviceVertical: vertical, pricingMode: defaultPrice === 0 ? "quote_required" : vertical === "detailing" ? "detailing_assessment" : inventory ? "tire_inventory" : "flat",
      serviceIntent: intent, requiresTireQuantity: inventory, requiresFitmentLookup: tire,
      requiresInventorySelection: inventory, allowsManualFitment: tire, isUpsell: false, sortOrder: start + i,
    };
  });
}

const STARTER_CATALOG = [
  ...build(A, "automotive", "general", 100),
  ...build(D, "detailing", "detailing", 200),
  ...build(T, "tire", "tires", 300),
  ...build(F, "fleet_mobile", "general", 400),
];

export async function fetchServiceTemplates(): Promise<ServiceTemplate[]> {
  return STARTER_CATALOG;
}
export async function fetchTemplateCategories(): Promise<TemplateCategory[]> {
  return CATEGORIES;
}

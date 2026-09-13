export type BookQuestionKey =
  | "cash"
  | "revenue"
  | "expenses"
  | "profit"
  | "owner_pay"
  | "investor_money"
  | "unresolved"
  | "mileage"
  | "reserve"
  | "can_take";

export type BookFacts = {
  cashIn: number;
  cashOut: number;
  netCashChange: number;
  revenue: number;
  operatingExpenses: number;
  operatingProfit: number;
  ownerDraws: number;
  investorCapital: number;
  unresolvedAmount: number;
  unresolvedCount: number;
  mileageMiles: number;
  mileageDeduction: number;
  minimumCashReserve: number;
};

export function haversineMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const earthRadiusMiles = 3958.7613;
  const toRad = (n: number) => n * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export async function routeMiles(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  accessToken?: string | null,
): Promise<{ miles: number; method: "mapbox_route" | "haversine_fallback" }> {
  if (accessToken) {
    try {
      const url =
        `https://api.mapbox.com/directions/v5/mapbox/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}` +
        `?overview=false&access_token=${encodeURIComponent(accessToken)}`;
      const response = await fetch(url);
      if (response.ok) {
        const json = await response.json();
        const meters = Number(json?.routes?.[0]?.distance);
        if (Number.isFinite(meters) && meters >= 0) {
          return { miles: meters / 1609.344, method: "mapbox_route" };
        }
      }
    } catch {
      // Deterministic fallback below.
    }
  }
  return { miles: haversineMiles(origin, destination), method: "haversine_fallback" };
}

export function identifyBookQuestion(input: string): BookQuestionKey | null {
  const q = input.trim().toLowerCase();
  if (!q) return null;
  if (/how much.*(cash|money).*(have|left)|cash position|net cash/.test(q)) return "cash";
  if (/revenue|sales|made|brought in|income/.test(q)) return "revenue";
  if (/expense|spent|spending|costs|money go/.test(q)) return "expenses";
  if (/profit|net income|operating profit/.test(q)) return "profit";
  if (/pay myself|owner pay|owner draw|paid myself/.test(q)) return "owner_pay";
  if (/investor|capital contribution|investment money/.test(q)) return "investor_money";
  if (/unresolved|unknown|unclassified/.test(q)) return "unresolved";
  if (/mileage|miles|driving|vehicle deduction/.test(q)) return "mileage";
  if (/reserve|runway|operating floor/.test(q)) return "reserve";
  if (/can i take|safe.*withdraw|owner distribution/.test(q)) return "can_take";
  return null;
}

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

export function answerBookQuestion(question: string, facts: BookFacts): {
  key: BookQuestionKey | null;
  answer: string;
  formula?: string;
} {
  const key = identifyBookQuestion(question);
  switch (key) {
    case "cash":
      return { key, answer: `Imported bank activity shows a net cash change of ${money(facts.netCashChange)}.`, formula: "cash in - cash out" };
    case "revenue":
      return { key, answer: `Classified operating revenue is ${money(facts.revenue)}. Investor capital is excluded.`, formula: "customer/fleet/cash revenue classifications only" };
    case "expenses":
      return { key, answer: `Classified operating expenses are ${money(facts.operatingExpenses)}. Owner draws and investor capital are not operating expenses.`, formula: "approved operating expense classifications - merchant refunds" };
    case "profit":
      return { key, answer: `Operating profit is ${money(facts.operatingProfit)} before taxes, depreciation, and accountant adjustments.`, formula: "operating revenue - operating expenses" };
    case "owner_pay":
      return { key, answer: `Owner draws/pay classified in the ledger total ${money(facts.ownerDraws)}.`, formula: "sum of owner_draw outflows" };
    case "investor_money":
      return { key, answer: `Investor/capital contributions classified in the ledger total ${money(facts.investorCapital)}.`, formula: "sum of investor_capital inflows" };
    case "unresolved":
      return { key, answer: `${facts.unresolvedCount} transactions remain unresolved, totaling ${money(facts.unresolvedAmount)}.`, formula: "sum of absolute unresolved transaction amounts" };
    case "mileage":
      return { key, answer: `Tracked business mileage is ${facts.mileageMiles.toFixed(1)} miles with ${money(facts.mileageDeduction)} of calculated mileage value at the configured rate.`, formula: "sum(trip miles × configured rate)" };
    case "reserve":
      return { key, answer: `The configured minimum operating reserve is ${money(facts.minimumCashReserve)}.`, formula: "workspace bookkeeping setting" };
    case "can_take": {
      const headroom = Math.max(0, facts.netCashChange - facts.minimumCashReserve);
      return { key, answer: `Based only on imported net cash and the configured reserve, current headroom is ${money(headroom)}. This is a cash-control answer, not tax or legal advice.`, formula: "max(0, net cash change - minimum reserve)" };
    }
    default:
      return {
        key: null,
        answer: "I can answer deterministic bookkeeping questions about cash, revenue, expenses, profit, owner pay, investor capital, unresolved transactions, mileage, reserve, or safe-withdrawal headroom.",
      };
  }
}

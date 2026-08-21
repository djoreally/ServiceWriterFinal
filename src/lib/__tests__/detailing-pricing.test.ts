import { calculateDetailingQuote,defaultDetailingRule } from "../detailing-pricing";

const vehicle=(overrides:any={})=>({id:"v1",year:"2022",make:"Ford",model:"Transit",licensePlate:"",vin:"",mileage:"",detailingVehicleSize:"oversize",detailingCondition:"heavy",...overrides});
describe("detailing pricing",()=>{
  it("uses explicit provider price/duration and quote thresholds",()=>{const rule={...defaultDetailingRule("oversize","heavy"),priceMultiplier:2,durationMultiplier:1.75,flatFee:25,requiresWater:true};const quote=calculateDetailingQuote(200,120,[vehicle()],[rule]);expect(quote.adjustment).toBe(225);expect(quote.durationAdjustment).toBe(90);expect(quote.quoteRequired).toBe(true);expect(quote.photoRequired).toBe(true);expect(quote.requirements.water).toBe(true);expect(quote.estimateLabel).toBe("Quote required");});
  it("keeps light compact work as a starting estimate",()=>{const quote=calculateDetailingQuote(100,60,[vehicle({detailingVehicleSize:"compact",detailingCondition:"light"})],[]);expect(quote.adjustment).toBe(0);expect(quote.quoteRequired).toBe(false);expect(quote.estimateLabel).toBe("Starting estimate");});
});

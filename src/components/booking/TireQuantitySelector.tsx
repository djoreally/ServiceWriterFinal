import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TOTAL_QUANTITIES = [1, 2, 4] as const;
const AXLE_QUANTITIES = [0, 1, 2] as const;

interface TireQuantitySelectorProps {
  isStaggered: boolean;
  frontQuantity?: number;
  rearQuantity?: number;
  onChange: (quantities: { tireFrontQuantity: number; tireRearQuantity: number }) => void;
}

export function TireQuantitySelector({
  isStaggered,
  frontQuantity,
  rearQuantity,
  onChange,
}: TireQuantitySelectorProps) {
  if (!isStaggered) {
    return (
      <div className="space-y-2 rounded-lg border p-4">
        <div>
          <p className="text-sm font-medium">How many tires do you need?</p>
          <p className="text-xs text-muted-foreground">
            Choose the number of tires you want installed or replaced.
          </p>
        </div>
        <div className="max-w-xs">
          <Label htmlFor="tire-total-quantity">Total tire quantity</Label>
          <Select
            value={frontQuantity ? String(frontQuantity) : ""}
            onValueChange={(value) =>
              onChange({
                tireFrontQuantity: Number(value),
                tireRearQuantity: 0,
              })
            }
          >
            <SelectTrigger id="tire-total-quantity" className="mt-1">
              <SelectValue placeholder="Select quantity" />
            </SelectTrigger>
            <SelectContent>
              {TOTAL_QUANTITIES.map((quantity) => (
                <SelectItem key={quantity} value={String(quantity)}>
                  {quantity} {quantity === 1 ? "tire" : "tires"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div>
        <p className="text-sm font-medium">How many tires do you need?</p>
        <p className="text-xs text-muted-foreground">
          This vehicle uses different front and rear tire sizes. Choose each position separately.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="tire-front-quantity">Front tires</Label>
          <Select
            value={frontQuantity === undefined ? "" : String(frontQuantity)}
            onValueChange={(value) =>
              onChange({
                tireFrontQuantity: Number(value),
                tireRearQuantity: rearQuantity ?? 0,
              })
            }
          >
            <SelectTrigger id="tire-front-quantity" className="mt-1">
              <SelectValue placeholder="Select front quantity" />
            </SelectTrigger>
            <SelectContent>
              {AXLE_QUANTITIES.map((quantity) => (
                <SelectItem key={quantity} value={String(quantity)}>
                  {quantity === 0 ? "None" : `${quantity} ${quantity === 1 ? "tire" : "tires"}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="tire-rear-quantity">Rear tires</Label>
          <Select
            value={rearQuantity === undefined ? "" : String(rearQuantity)}
            onValueChange={(value) =>
              onChange({
                tireFrontQuantity: frontQuantity ?? 0,
                tireRearQuantity: Number(value),
              })
            }
          >
            <SelectTrigger id="tire-rear-quantity" className="mt-1">
              <SelectValue placeholder="Select rear quantity" />
            </SelectTrigger>
            <SelectContent>
              {AXLE_QUANTITIES.map((quantity) => (
                <SelectItem key={quantity} value={String(quantity)}>
                  {quantity === 0 ? "None" : `${quantity} ${quantity === 1 ? "tire" : "tires"}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

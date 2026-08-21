/**
 * TerminologySection - Customizable labels for the application
 */

import { Tags } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Terminology } from "@/contexts/TerminologyContext";

interface TerminologySectionProps {
  terminology: Terminology;
  onTerminologyChange: (key: keyof Terminology, value: string) => void;
}

export function TerminologySection({ terminology, onTerminologyChange }: TerminologySectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tags className="h-5 w-5" />
          Terminology
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Customize the labels used throughout the app to match your business
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor="term_customer">Customer Label</Label>
            <Input
              id="term_customer"
              placeholder="Customer, Client, Account..."
              value={terminology.customer}
              onChange={(e) => onTerminologyChange("customer", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">e.g., Client, Account, Contact</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="term_vehicle">Vehicle Label</Label>
            <Input
              id="term_vehicle"
              placeholder="Vehicle, Unit, Asset..."
              value={terminology.vehicle}
              onChange={(e) => onTerminologyChange("vehicle", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">e.g., Unit, Asset, Equipment</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="term_service">Service Label</Label>
            <Input
              id="term_service"
              placeholder="Service, Work Order, Job..."
              value={terminology.service}
              onChange={(e) => onTerminologyChange("service", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">e.g., Work Order, Job, Repair</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="term_quote">Quote Label</Label>
            <Input
              id="term_quote"
              placeholder="Quote, Estimate, Proposal..."
              value={terminology.quote}
              onChange={(e) => onTerminologyChange("quote", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">e.g., Estimate, Proposal, Bid</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

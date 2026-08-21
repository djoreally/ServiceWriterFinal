import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Wrench, Plus, Check } from "lucide-react";

interface ServiceData {
  name: string;
  description: string;
  price: number;
  duration: number;
}

interface FirstServiceStepProps {
  data: ServiceData;
  onUpdate: (data: Partial<ServiceData>) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

const SERVICE_SUGGESTIONS = [
  { name: "Oil Change", description: "Full synthetic oil change with filter", price: 65, duration: 30 },
  { name: "Tire Rotation", description: "Rotate all four tires for even wear", price: 35, duration: 20 },
  { name: "Brake Inspection", description: "Complete brake system inspection", price: 49, duration: 30 },
  { name: "A/C Service", description: "Air conditioning inspection and recharge", price: 89, duration: 45 },
  { name: "Battery Test", description: "Battery health check and terminal cleaning", price: 25, duration: 15 },
  { name: "Full Inspection", description: "Comprehensive vehicle inspection", price: 99, duration: 60 },
];

export const FirstServiceStep = ({ data, onUpdate, onNext, onBack, onSkip }: FirstServiceStepProps) => {
  const [selectedSuggestion, setSelectedSuggestion] = useState<number | null>(null);

  const handleSelectSuggestion = (index: number) => {
    const suggestion = SERVICE_SUGGESTIONS[index];
    setSelectedSuggestion(index);
    onUpdate({
      name: suggestion.name,
      description: suggestion.description,
      price: suggestion.price,
      duration: suggestion.duration,
    });
  };

  const isValid = data.name.trim().length > 0 && data.price > 0;

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="text-center pb-2">
        <div className="mx-auto w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center mb-4">
          <Wrench className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-2xl">Add your first service</CardTitle>
        <CardDescription className="text-base">
          What services do you offer? Start with one — you can add more later
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 max-w-lg mx-auto">
        {/* Quick suggestions */}
        <div>
          <Label className="text-sm text-muted-foreground mb-2 block">
            Quick start with a common service:
          </Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {SERVICE_SUGGESTIONS.map((suggestion, index) => (
              <Button
                key={index}
                variant={selectedSuggestion === index ? "default" : "outline"}
                size="sm"
                className="h-auto py-2 px-3 text-left justify-start"
                onClick={() => handleSelectSuggestion(index)}
              >
                {selectedSuggestion === index && (
                  <Check className="h-3 w-3 mr-1 flex-shrink-0" />
                )}
                <span className="truncate">{suggestion.name}</span>
              </Button>
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">
              Or customize
            </span>
          </div>
        </div>

        {/* Custom service form */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="service_name">Service Name</Label>
            <Input
              id="service_name"
              value={data.name}
              onChange={(e) => {
                setSelectedSuggestion(null);
                onUpdate({ name: e.target.value });
              }}
              placeholder="e.g., Oil Change"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="service_description">Description</Label>
            <Textarea
              id="service_description"
              value={data.description}
              onChange={(e) => onUpdate({ description: e.target.value })}
              placeholder="What's included in this service?"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="service_price">Price ($)</Label>
              <Input
                id="service_price"
                type="number"
                min="0"
                step="0.01"
                value={data.price || ""}
                onChange={(e) => onUpdate({ price: parseFloat(e.target.value) || 0 })}
                placeholder="65.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="service_duration">Duration (mins)</Label>
              <Input
                id="service_duration"
                type="number"
                min="5"
                step="5"
                value={data.duration || ""}
                onChange={(e) => onUpdate({ duration: parseInt(e.target.value) || 30 })}
                placeholder="30"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} className="flex-1">
            Back
          </Button>
          <Button onClick={onNext} className="flex-1" disabled={!isValid}>
            <Plus className="h-4 w-4 mr-2" />
            Add Service
          </Button>
        </div>

        <Button
          variant="ghost"
          onClick={onSkip}
          className="w-full text-muted-foreground"
        >
          Skip for now
        </Button>
      </CardContent>
    </Card>
  );
};

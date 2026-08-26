import { useState, useEffect } from "react";
import {
  saveInspection,
  fetchInspectionPerformerData,
  fetchInspectionItems,
  type InspectionResultData,
  type InspectionTemplateOption,
  type InspectionItemOption,
  type PastInspection,
} from "@/application/commands/inspection-performer.command";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ClipboardCheck, CheckCircle2, XCircle, AlertTriangle, Minus, Play, Save } from "lucide-react";
import { toast } from "@/components/ui/sonner";

interface InspectionPerformerProps {
  serviceId?: string;
  vehicleId?: string;
  appointmentId?: string;
  onComplete?: () => void;
}

const STATUS_OPTIONS = [
  { value: "pass", label: "Pass", icon: CheckCircle2, color: "text-gray-600" },
  { value: "fail", label: "Fail", icon: XCircle, color: "text-red-600" },
  { value: "warning", label: "Warning", icon: AlertTriangle, color: "text-yellow-600" },
  { value: "not_applicable", label: "N/A", icon: Minus, color: "text-muted-foreground" },
];

export function InspectionPerformer({ serviceId, vehicleId, appointmentId, onComplete }: InspectionPerformerProps) {
  const [templates, setTemplates] = useState<InspectionTemplateOption[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<InspectionTemplateOption | null>(null);
  const [items, setItems] = useState<InspectionItemOption[]>([]);
  const [results, setResults] = useState<Record<string, InspectionResultData>>({});
  const [inspectorName, setInspectorName] = useState("");
  const [overallNotes, setOverallNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPerform, setShowPerform] = useState(false);
  const [pastInspections, setPastInspections] = useState<PastInspection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [serviceId, vehicleId]);

  const fetchData = async () => {
    const data = await fetchInspectionPerformerData(serviceId, vehicleId);
    setTemplates(data.templates);
    setPastInspections(data.pastInspections);
    setLoading(false);
  };

  const handleSelectTemplate = async (templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;

    setSelectedTemplate(template);
    const itemsData = await fetchInspectionItems(templateId);
    setItems(itemsData);

    const initialResults: Record<string, InspectionResultData> = {};
    itemsData.forEach((item) => {
      initialResults[item.id] = {
        item_name: item.name,
        item_category: item.category,
        status: "not_checked",
        notes: "",
        sort_order: item.sort_order,
      };
    });
    setResults(initialResults);
  };

  const handleStatusChange = (itemId: string, status: string) => {
    setResults((prev) => ({ ...prev, [itemId]: { ...prev[itemId], status } }));
  };

  const handleNotesChange = (itemId: string, notes: string) => {
    setResults((prev) => ({ ...prev, [itemId]: { ...prev[itemId], notes } }));
  };

  const handleSaveInspection = async () => {
    if (!selectedTemplate) return;

    const uncheckedRequired = items.filter(
      (item) => item.is_required && results[item.id]?.status === "not_checked"
    );

    if (uncheckedRequired.length > 0) {
      toast.error(`Please complete all required items: ${uncheckedRequired.map((i) => i.name).join(", ")}`);
      return;
    }

    setSaving(true);
    try {
      await saveInspection({
        serviceId,
        vehicleId,
        appointmentId,
        templateId: selectedTemplate.id,
        templateName: selectedTemplate.name,
        inspectorName: inspectorName || undefined,
        notes: overallNotes || undefined,
        results,
      });

      toast.success("Inspection saved successfully");
      setShowPerform(false);
      setSelectedTemplate(null);
      setItems([]);
      setResults({});
      setInspectorName("");
      setOverallNotes("");
      fetchData();
      onComplete?.();
    } catch (error) {
      console.error("Save error:", error);
      toast.error("Failed to save inspection");
    } finally {
      setSaving(false);
    }
  };

  const getStatusStats = () => {
    const statuses = Object.values(results);
    return {
      pass: statuses.filter((r) => r.status === "pass").length,
      fail: statuses.filter((r) => r.status === "fail").length,
      warning: statuses.filter((r) => r.status === "warning").length,
      unchecked: statuses.filter((r) => r.status === "not_checked").length,
    };
  };

  const groupedItems = items.reduce((acc, item) => {
    const cat = item.category || "other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, InspectionItemOption[]>);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5" />
          Vehicle Inspections
        </h3>
        <Dialog open={showPerform} onOpenChange={setShowPerform}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2" disabled={templates.length === 0}>
              <Play className="h-4 w-4" />
              New Inspection
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Perform Inspection</DialogTitle>
            </DialogHeader>

            {!selectedTemplate ? (
              <div className="space-y-4">
                <Label>Select Inspection Template</Label>
                <div className="grid gap-2">
                  {templates.map((template) => (
                    <Card
                      key={template.id}
                      className="cursor-pointer hover:border-primary transition-colors"
                      onClick={() => handleSelectTemplate(template.id)}
                    >
                      <CardContent className="p-4">
                        <h4 className="font-medium">{template.name}</h4>
                        {template.description && (
                          <p className="text-sm text-muted-foreground">{template.description}</p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">{selectedTemplate.name}</h4>
                    <p className="text-sm text-muted-foreground">{items.length} items to inspect</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setSelectedTemplate(null)}>
                    Change Template
                  </Button>
                </div>

                <div className="grid grid-cols-4 gap-2 text-center text-sm">
                  <div className="p-2 bg-gray-500/10 rounded">
                    <div className="font-bold text-gray-600">{getStatusStats().pass}</div>
                    <div className="text-muted-foreground">Pass</div>
                  </div>
                  <div className="p-2 bg-red-500/10 rounded">
                    <div className="font-bold text-red-600">{getStatusStats().fail}</div>
                    <div className="text-muted-foreground">Fail</div>
                  </div>
                  <div className="p-2 bg-yellow-500/10 rounded">
                    <div className="font-bold text-yellow-600">{getStatusStats().warning}</div>
                    <div className="text-muted-foreground">Warning</div>
                  </div>
                  <div className="p-2 bg-muted rounded">
                    <div className="font-bold">{getStatusStats().unchecked}</div>
                    <div className="text-muted-foreground">Unchecked</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Inspector Name (optional)</Label>
                  <Input
                    value={inspectorName}
                    onChange={(e) => setInspectorName(e.target.value)}
                    placeholder="Enter your name"
                  />
                </div>

                <div className="space-y-4">
                  {Object.entries(groupedItems).map(([category, catItems]) => (
                    <div key={category}>
                      <h5 className="font-medium text-sm text-muted-foreground uppercase mb-2 capitalize">
                        {category}
                      </h5>
                      <div className="space-y-3">
                        {catItems.map((item) => (
                          <div key={item.id} className="border rounded-lg p-3 space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm flex-1">
                                {item.name}
                                {item.is_required && (
                                  <span className="text-destructive ml-1">*</span>
                                )}
                              </span>
                            </div>
                            {item.description && (
                              <p className="text-xs text-muted-foreground">{item.description}</p>
                            )}
                            <RadioGroup
                              value={results[item.id]?.status || "not_checked"}
                              onValueChange={(v) => handleStatusChange(item.id, v)}
                              className="flex gap-2"
                            >
                              {STATUS_OPTIONS.map((opt) => (
                                <div key={opt.value} className="flex items-center">
                                  <RadioGroupItem
                                    value={opt.value}
                                    id={`${item.id}-${opt.value}`}
                                    className="sr-only peer"
                                  />
                                  <label
                                    htmlFor={`${item.id}-${opt.value}`}
                                    className={`flex items-center gap-1 px-2 py-1 rounded border cursor-pointer text-xs peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/10 ${opt.color}`}
                                  >
                                    <opt.icon className="h-3 w-3" />
                                    {opt.label}
                                  </label>
                                </div>
                              ))}
                            </RadioGroup>
                            <Input
                              placeholder="Notes (optional)"
                              value={results[item.id]?.notes || ""}
                              onChange={(e) => handleNotesChange(item.id, e.target.value)}
                              className="text-sm h-8"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <Label>Overall Notes (optional)</Label>
                  <Textarea
                    value={overallNotes}
                    onChange={(e) => setOverallNotes(e.target.value)}
                    placeholder="Any additional observations..."
                  />
                </div>

                <Button onClick={handleSaveInspection} disabled={saving} className="w-full gap-2">
                  <Save className="h-4 w-4" />
                  {saving ? "Saving..." : "Save Inspection"}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <ClipboardCheck className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No inspection templates available</p>
            <p className="text-sm">Create templates in Settings to start performing inspections</p>
          </CardContent>
        </Card>
      ) : pastInspections.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <ClipboardCheck className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No inspections recorded yet</p>
            <p className="text-sm">Start a new inspection to document vehicle condition</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {pastInspections.map((inspection) => (
            <Card key={inspection.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">{inspection.template_name}</h4>
                    <p className="text-sm text-muted-foreground">
                      {new Date(inspection.inspection_date).toLocaleDateString()}
                      {inspection.inspector_name && ` • ${inspection.inspector_name}`}
                    </p>
                  </div>
                  <Badge variant={inspection.status === "completed" ? "default" : "secondary"}>
                    {inspection.status}
                  </Badge>
                </div>
                {inspection.notes && (
                  <p className="text-sm mt-2 text-muted-foreground">{inspection.notes}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

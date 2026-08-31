import { useState, useEffect } from "react";
import { fetchInspectionTemplates, type InspectionTemplate, type InspectionItem } from "@/application/queries/inspections.query";
import {
  createInspectionTemplate,
  updateInspectionTemplate,
  deleteInspectionTemplate,
  toggleInspectionTemplateActive,
  addInspectionItem,
  deleteInspectionItem,
} from "@/application/commands/inspections.command";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ClipboardList, Plus, Edit, Trash2, GripVertical, Save } from "lucide-react";
import { toast } from "@/components/ui/sonner";

// Types imported from application layer

const TEMPLATE_CATEGORIES = [
  { value: "general", label: "General Inspection" },
  { value: "pre-service", label: "Pre-Service Check" },
  { value: "post-service", label: "Post-Service Check" },
  { value: "safety", label: "Safety Inspection" },
];

const ITEM_CATEGORIES = [
  { value: "engine", label: "Engine" },
  { value: "brakes", label: "Brakes" },
  { value: "suspension", label: "Suspension" },
  { value: "fluids", label: "Fluids" },
  { value: "electrical", label: "Electrical" },
  { value: "exterior", label: "Exterior" },
  { value: "interior", label: "Interior" },
  { value: "tires", label: "Tires" },
  { value: "other", label: "Other" },
];

export function InspectionTemplateManager() {
  const [templates, setTemplates] = useState<InspectionTemplate[]>([]);
  const [items, setItems] = useState<Record<string, InspectionItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<InspectionTemplate | null>(null);
  const [showAddItem, setShowAddItem] = useState<string | null>(null);
  
  const [templateForm, setTemplateForm] = useState({
    name: "",
    description: "",
    category: "general",
  });

  const [itemForm, setItemForm] = useState({
    name: "",
    description: "",
    category: "other",
    is_required: false,
  });


  const fetchTemplates = async () => {
    try {
      const data = await fetchInspectionTemplates();
      setTemplates(data.templates);
      setItems(data.items);
    } catch {
      toast.error("Failed to load templates");
    }
    setLoading(false);
  };

  useEffect(() => {
    void Promise.resolve().then(() => fetchTemplates());
  }, []);

  const handleCreateTemplate = async () => {
    if (!templateForm.name.trim()) {
      toast.error("Please enter a template name");
      return;
    }
    try {
      await createInspectionTemplate({
        name: templateForm.name,
        description: templateForm.description || null,
        category: templateForm.category,
      });
      toast.success("Template created");
      setShowCreateTemplate(false);
      setTemplateForm({ name: "", description: "", category: "general" });
      fetchTemplates();
    } catch {
      toast.error("Failed to create template");
    }
  };

  const handleUpdateTemplate = async () => {
    if (!editingTemplate || !templateForm.name.trim()) return;
    try {
      await updateInspectionTemplate(editingTemplate.id, {
        name: templateForm.name,
        description: templateForm.description || null,
        category: templateForm.category,
      });
      toast.success("Template updated");
      setEditingTemplate(null);
      setTemplateForm({ name: "", description: "", category: "general" });
      fetchTemplates();
    } catch {
      toast.error("Failed to update template");
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm("Delete this template and all its items?")) return;
    try {
      await deleteInspectionTemplate(id);
      toast.success("Template deleted");
      fetchTemplates();
    } catch {
      toast.error("Failed to delete template");
    }
  };

  const handleToggleActive = async (template: InspectionTemplate) => {
    try {
      await toggleInspectionTemplateActive(template.id, template.is_active);
      fetchTemplates();
    } catch {
      toast.error("Failed to update template");
    }
  };

  const handleAddItem = async (templateId: string) => {
    if (!itemForm.name.trim()) {
      toast.error("Please enter an item name");
      return;
    }
    const currentItems = items[templateId] || [];
    try {
      await addInspectionItem(templateId, {
        name: itemForm.name,
        description: itemForm.description || null,
        category: itemForm.category,
        is_required: itemForm.is_required,
      }, currentItems.length);
      toast.success("Item added");
      setShowAddItem(null);
      setItemForm({ name: "", description: "", category: "other", is_required: false });
      fetchTemplates();
    } catch {
      toast.error("Failed to add item");
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      await deleteInspectionItem(itemId);
      fetchTemplates();
    } catch {
      toast.error("Failed to delete item");
    }
  };

  const startEditTemplate = (template: InspectionTemplate) => {
    setTemplateForm({
      name: template.name,
      description: template.description || "",
      category: template.category,
    });
    setEditingTemplate(template);
  };

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
          <ClipboardList className="h-5 w-5" />
          Inspection Templates
        </h3>
        <Dialog open={showCreateTemplate} onOpenChange={setShowCreateTemplate}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              New Template
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Inspection Template</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Template Name</Label>
                <Input
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                  placeholder="e.g., Full Vehicle Inspection"
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={templateForm.category}
                  onValueChange={(v) => setTemplateForm({ ...templateForm, category: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Description (optional)</Label>
                <Textarea
                  value={templateForm.description}
                  onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
                  placeholder="Describe when to use this template..."
                />
              </div>
              <Button onClick={handleCreateTemplate} className="w-full">
                Create Template
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Template Dialog */}
      <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Template Name</Label>
              <Input
                value={templateForm.name}
                onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={templateForm.category}
                onValueChange={(v) => setTemplateForm({ ...templateForm, category: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={templateForm.description}
                onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
              />
            </div>
            <Button onClick={handleUpdateTemplate} className="w-full">
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <ClipboardList className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No inspection templates yet</p>
            <p className="text-sm">Create templates to standardize your vehicle inspections</p>
          </CardContent>
        </Card>
      ) : (
        <Accordion type="single" collapsible className="space-y-2">
          {templates.map((template) => (
            <AccordionItem key={template.id} value={template.id} className="border rounded-lg">
              <AccordionTrigger className="px-4 hover:no-underline">
                <div className="flex items-center gap-3 flex-1">
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{template.name}</span>
                      <Badge variant={template.is_active ? "default" : "secondary"}>
                        {template.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {TEMPLATE_CATEGORIES.find((c) => c.value === template.category)?.label} •{" "}
                      {(items[template.id] || []).length} items
                    </p>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="flex items-center gap-2 mb-4">
                  <Switch
                    checked={template.is_active}
                    onCheckedChange={() => handleToggleActive(template)}
                  />
                  <span className="text-sm">Active</span>
                  <div className="flex-1" />
                  <Button size="sm" variant="outline" onClick={() => startEditTemplate(template)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    onClick={() => handleDeleteTemplate(template.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {template.description && (
                  <p className="text-sm text-muted-foreground mb-4">{template.description}</p>
                )}

                <div className="space-y-2">
                  {(items[template.id] || []).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg group"
                    >
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1">
                        <span className="text-sm">{item.name}</span>
                        {item.is_required && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            Required
                          </Badge>
                        )}
                        {item.category && (
                          <span className="text-xs text-muted-foreground ml-2">
                            ({ITEM_CATEGORIES.find((c) => c.value === item.category)?.label})
                          </span>
                        )}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100"
                        onClick={() => handleDeleteItem(item.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>

                <Dialog
                  open={showAddItem === template.id}
                  onOpenChange={(open) => setShowAddItem(open ? template.id : null)}
                >
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="mt-3 gap-2">
                      <Plus className="h-4 w-4" />
                      Add Item
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Inspection Item</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Item Name</Label>
                        <Input
                          value={itemForm.name}
                          onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                          placeholder="e.g., Check brake pads"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Category</Label>
                        <Select
                          value={itemForm.category}
                          onValueChange={(v) => setItemForm({ ...itemForm, category: v })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ITEM_CATEGORIES.map((cat) => (
                              <SelectItem key={cat.value} value={cat.value}>
                                {cat.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Description (optional)</Label>
                        <Input
                          value={itemForm.description}
                          onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                          placeholder="Additional instructions..."
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={itemForm.is_required}
                          onCheckedChange={(v) => setItemForm({ ...itemForm, is_required: v })}
                        />
                        <Label>Required item</Label>
                      </div>
                      <Button onClick={() => handleAddItem(template.id)} className="w-full">
                        Add Item
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}

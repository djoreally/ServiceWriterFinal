import { useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/sonner";
import { Library, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { errorMessage } from "@/lib/error-message";
import { fetchServiceTemplates, fetchTemplateCategories, type ServiceTemplate, type TemplateCategory } from "@/application/queries/service-templates.query";
import { adoptServiceTemplates } from "@/application/commands/adopt-service-templates.command";

const VERTICAL_FILTERS = [
  { value: "all", label: "All categories" },
  { value: "general", label: "Automotive" },
  { value: "detailing", label: "Detailing" },
  { value: "tires", label: "Tires" },
] as const;

type VerticalFilter = (typeof VERTICAL_FILTERS)[number]["value"];

interface ServiceLibraryDialogProps {
  /** Template ids already in the shop's catalog — shown as added, not selectable. */
  adoptedTemplateIds: string[];
  onAdopted: () => void;
}

export function ServiceLibraryDialog({ adoptedTemplateIds, onAdopted }: ServiceLibraryDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<ServiceTemplate[]>([]);
  const [categories, setCategories] = useState<TemplateCategory[]>([]);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [vertical, setVertical] = useState<VerticalFilter>("all");

  const adopted = useMemo(() => new Set(adoptedTemplateIds), [adoptedTemplateIds]);

  useEffect(() => {
    if (!open || templates.length > 0) return;
    void Promise.resolve().then(() => setLoading(true));
    void Promise.resolve().then(() => Promise.all([fetchServiceTemplates(), fetchTemplateCategories()])
      .then(([libraryTemplates, libraryCategories]) => {
        setTemplates(libraryTemplates);
        setCategories(libraryCategories);
      })
      .catch((error: unknown) => toast.error("Could not load the service library", { description: errorMessage(error) }))
      .finally(() => setLoading(false)));
  }, [open, templates.length]);

  const grouped = useMemo(() => {
    const categoryName = (id: string | null) => categories.find((category) => category.id === id)?.name ?? "Other";
    const term = search.trim().toLowerCase();
    const matches = templates.filter((template) => {
      if (vertical !== "all" && template.serviceVertical !== vertical) return false;
      if (!term) return true;
      return template.name.toLowerCase().includes(term) || (template.description ?? "").toLowerCase().includes(term);
    });

    const buckets = new Map<string, ServiceTemplate[]>();
    matches.forEach((template) => {
      const key = template.categoryId ?? "other";
      buckets.set(key, [...(buckets.get(key) ?? []), template]);
    });

    return [...buckets.entries()]
      .map(([categoryId, items]) => ({
        categoryId,
        label: categoryName(categoryId === "other" ? null : categoryId),
        sortOrder: categories.find((category) => category.id === categoryId)?.sortOrder ?? 999,
        items,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));

  }, [search, templates, vertical, categories]);

  const selectedCount = Object.keys(selected).length;

  const toggle = (template: ServiceTemplate, checked: boolean) => {
    setSelected((current) => {
      const next = { ...current };
      if (checked) next[template.id] = template.defaultPrice;
      else delete next[template.id];
      return next;
    });
  };

  const add = async () => {
    setSaving(true);
    try {
      const adoptions = templates
        .filter((template) => template.id in selected)
        .map((template) => ({ template, price: selected[template.id] }));
      const count = await adoptServiceTemplates(adoptions);
      toast.success(`${count} ${count === 1 ? "service" : "services"} added to your catalog`);
      setSelected({});
      setOpen(false);
      onAdopted();
    } catch (error) {
      toast.error("Could not add those services", { description: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Library className="mr-2 h-4 w-4" />
          Add from library
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Service library</DialogTitle>
          <DialogDescription>
            Pre-built services for every category. Pick what you offer, set your price, and they're live in your catalog and booking page.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search services" className="pl-8" />
          </div>
          <div className="flex gap-1 rounded-md border bg-muted/30 p-0.5">
            {VERTICAL_FILTERS.map((filter) => (
              <Button
                key={filter.value}
                size="sm"
                variant={vertical === filter.value ? "default" : "ghost"}
                className="h-8 px-2.5 text-xs"
                onClick={() => setVertical(filter.value)}
              >
                {filter.label}
              </Button>
            ))}
          </div>
        </div>

        <ScrollArea className="h-[52vh] pr-3">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading library…
            </div>
          ) : grouped.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No library services match that search.</p>
          ) : (
            <div className="space-y-5">
              {grouped.map((group) => (
                <section key={group.categoryId} className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</h3>
                  <div className="space-y-2">
                    {group.items.map((template) => {
                      const alreadyAdded = adopted.has(template.id);
                      const isSelected = template.id in selected;
                      return (
                        <div key={template.id} className="flex items-start gap-3 rounded-md border bg-card p-3">
                          <Checkbox
                            checked={isSelected}
                            disabled={alreadyAdded || saving}
                            onCheckedChange={(checked) => toggle(template, checked === true)}
                            aria-label={`Add ${template.name}`}
                            className="mt-1"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-foreground">{template.name}</span>
                              {template.isUpsell && <Badge variant="secondary">Add-on</Badge>}
                              {alreadyAdded && <Badge variant="outline">Already added</Badge>}
                            </div>
                            {template.description && <p className="mt-0.5 text-xs text-muted-foreground">{template.description}</p>}
                            <p className="mt-1 text-xs text-muted-foreground">
                              {template.durationMinutes ? `${template.durationMinutes} min` : "Duration varies"}
                              {template.skillLevel ? ` · ${template.skillLevel}` : ""}
                            </p>
                          </div>
                          <div className="w-28 shrink-0">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              inputMode="decimal"
                              disabled={alreadyAdded || !isSelected || saving}
                              value={isSelected ? selected[template.id] : template.defaultPrice}
                              onChange={(event) =>
                                setSelected((current) => ({ ...current, [template.id]: Number(event.target.value) }))
                              }
                              aria-label={`Price for ${template.name}`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            {selectedCount === 0 ? "Prices are editable now and any time after." : `${selectedCount} selected`}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void add()} disabled={selectedCount === 0 || saving}>
              {saving ? "Adding…" : `Add ${selectedCount || ""} to catalog`.trim()}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

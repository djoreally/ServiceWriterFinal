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
  { value: "fleet", label: "Fleet / Mobile" },
] as const;
type VerticalFilter = (typeof VERTICAL_FILTERS)[number]["value"];
interface ServiceLibraryDialogProps { adoptedTemplateIds: string[]; onAdopted: () => void; }

export function ServiceLibraryDialog({ adoptedTemplateIds, onAdopted }: ServiceLibraryDialogProps) {
  const [open,setOpen]=useState(false), [saving,setSaving]=useState(false);
  const [templates,setTemplates]=useState<ServiceTemplate[]>([]), [categories,setCategories]=useState<TemplateCategory[]>([]);
  const [selected,setSelected]=useState<Record<string,number>>({}), [search,setSearch]=useState("");
  const [vertical,setVertical]=useState<VerticalFilter>("all");
  const adopted=useMemo(()=>new Set(adoptedTemplateIds),[adoptedTemplateIds]);

  useEffect(()=>{
    if(!open) return;
    let active=true;
    Promise.all([fetchServiceTemplates(),fetchTemplateCategories()])
      .then(([t,c])=>{if(active){setTemplates(t);setCategories(c);}})
      .catch((e:unknown)=>toast.error("Could not load the service library",{description:errorMessage(e)}));
    return()=>{active=false;};
  },[open]);

  const grouped=useMemo(()=>{
    const categoryName=(id:string|null)=>categories.find(c=>c.id===id)?.name??"Other";
    const term=search.trim().toLowerCase();
    const matches=templates.filter(t=>{
      if(vertical==="fleet"&&t.categoryId!=="fleet_mobile")return false;
      if(vertical==="general"&&t.categoryId!=="automotive")return false;
      if(vertical!=="all"&&vertical!=="fleet"&&vertical!=="general"&&t.serviceVertical!==vertical)return false;
      return !term||t.name.toLowerCase().includes(term)||(t.description??"").toLowerCase().includes(term);
    });
    const buckets=new Map<string,ServiceTemplate[]>();
    matches.forEach(t=>{const k=t.categoryId??"other";buckets.set(k,[...(buckets.get(k)??[]),t]);});
    return [...buckets.entries()].map(([categoryId,items])=>({categoryId,label:categoryName(categoryId==="other"?null:categoryId),sortOrder:categories.find(c=>c.id===categoryId)?.sortOrder??999,items})).sort((a,b)=>a.sortOrder-b.sortOrder||a.label.localeCompare(b.label));
  },[search,templates,vertical,categories]);

  const toggle=(t:ServiceTemplate,checked:boolean)=>setSelected(cur=>{const n={...cur};if(checked)n[t.id]=t.defaultPrice;else delete n[t.id];return n;});
  const selectedCount=Object.keys(selected).length;
  const add=async()=>{setSaving(true);try{const adoptions=templates.filter(t=>t.id in selected).map(template=>({template,price:selected[template.id]}));const count=await adoptServiceTemplates(adoptions);toast.success(`${count} ${count===1?"service":"services"} added to your catalog`);setSelected({});setOpen(false);onAdopted();}catch(e){toast.error("Could not add those services",{description:errorMessage(e)});}finally{setSaving(false);}};

  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button variant="outline"><Library className="mr-2 h-4 w-4"/>Add from library</Button></DialogTrigger>
    <DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>Service library</DialogTitle><DialogDescription>Pre-built starter services by category. Suggested ranges and durations are benchmarks — choose what you offer, adjust the price, then add it to your catalog.</DialogDescription></DialogHeader>
    <div className="flex flex-wrap items-center gap-2"><div className="relative min-w-[200px] flex-1"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"/><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search services" className="pl-8"/></div><div className="flex max-w-full flex-wrap gap-1 rounded-md border bg-muted/30 p-0.5">{VERTICAL_FILTERS.map(f=><Button key={f.value} size="sm" variant={vertical===f.value?"default":"ghost"} className="h-8 px-2.5 text-xs" onClick={()=>setVertical(f.value)}>{f.label}</Button>)}</div></div>
    <ScrollArea className="h-[52vh] pr-3">{grouped.length===0?<p className="py-10 text-center text-sm text-muted-foreground">No library services match that search.</p>:<div className="space-y-5">{grouped.map(g=><section key={g.categoryId} className="space-y-2"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</h3><div className="space-y-2">{g.items.map(t=>{const already=adopted.has(t.id),sel=t.id in selected;return <div key={t.id} className="flex items-start gap-3 rounded-md border bg-card p-3"><Checkbox checked={sel} disabled={already||saving} onCheckedChange={x=>toggle(t,x===true)} className="mt-1"/><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">{t.name}</span>{already&&<Badge variant="outline">Already added</Badge>}</div>{t.description&&<p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>}<p className="mt-1 text-xs text-muted-foreground">{t.durationLabel} · Suggested {t.suggestedPrice}</p></div><div className="w-28 shrink-0"><Input type="number" min="0" step="0.01" disabled={already||!sel||saving} value={sel?selected[t.id]:t.defaultPrice} onChange={e=>setSelected(cur=>({...cur,[t.id]:Number(e.target.value)}))}/></div></div>})}</div></section>)}</div>}</ScrollArea>
    <div className="flex items-center justify-between gap-2 border-t pt-3"><p className="text-xs text-muted-foreground">{selectedCount? `${selectedCount} selected · prices remain editable after adding`:"Adjust prices to your market and actual costs before publishing."}</p><div className="flex gap-2"><Button variant="ghost" onClick={()=>setOpen(false)} disabled={saving}>Cancel</Button><Button onClick={()=>void add()} disabled={!selectedCount||saving}>{saving?"Adding…":`Add ${selectedCount||""} to catalog`.trim()}</Button></div></div>
    </DialogContent></Dialog>;
}

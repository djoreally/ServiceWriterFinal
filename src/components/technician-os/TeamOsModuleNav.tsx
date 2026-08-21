import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import type { TeamOsModule } from "@/application/navigation/team-os-routes";
import { Award, Briefcase, Calendar, DollarSign, LayoutDashboard, Shield, UserCog, Users } from "lucide-react";

const modules: Array<{ id: TeamOsModule; label: string; icon: typeof Users }> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "roster", label: "Roster", icon: Users },
  { id: "schedule", label: "Schedule & Dispatch", icon: Calendar },
  { id: "skills", label: "Skills", icon: Award },
  { id: "compliance", label: "Compliance", icon: Shield },
  { id: "development", label: "Development", icon: Briefcase },
  { id: "compensation", label: "Compensation", icon: DollarSign },
  { id: "access", label: "Access", icon: UserCog },
];

export function TeamOsModuleNav({ active, attentionCount, onChange }: {
  active: TeamOsModule;
  attentionCount: number;
  onChange: (module: TeamOsModule) => void;
}) {
  return (
    <ScrollArea className="w-full whitespace-nowrap rounded-lg border bg-card">
      <div className="flex w-max gap-1 p-1.5">
        {modules.map(({ id, label, icon: Icon }) => (
          <Button key={id} size="sm" variant={active === id ? "default" : "ghost"} onClick={() => onChange(id)} className="gap-1.5">
            <Icon className="h-3.5 w-3.5" /> {label}
            {id === "compliance" && attentionCount > 0 && <Badge variant="destructive" className="ml-1 h-5 min-w-5 px-1.5">{attentionCount}</Badge>}
          </Button>
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}

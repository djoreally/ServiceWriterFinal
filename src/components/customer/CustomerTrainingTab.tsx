import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Calendar, CheckCircle2, CreditCard, FileText, Gift, ShieldCheck, Sparkles, Trophy, User } from "lucide-react";

type TrainingModule = {
  id: string;
  title: string;
  icon: typeof Sparkles;
  outcome: string;
  lessons: string[];
};

const STORAGE_KEY = "customer-portal-training-completed";

const modules: TrainingModule[] = [
  {
    id: "dashboard-home",
    title: "Use your dashboard home",
    icon: Sparkles,
    outcome: "Know where to find appointments, service records, payments, rewards, and profile settings.",
    lessons: ["Use Home as the quick-start area.", "Open cards to jump to the task you need.", "Use the top tabs when you already know where you want to go."],
  },
  {
    id: "appointments",
    title: "Manage appointments",
    icon: Calendar,
    outcome: "Understand how to track upcoming visits and use reschedule/cancel tools when available.",
    lessons: ["Upcoming appointments show active visits.", "Past appointments keep your service timeline clean.", "Status badges tell you what is happening next."],
  },
  {
    id: "service-history",
    title: "Read service history",
    icon: FileText,
    outcome: "Use completed service records to understand what was done and what may be due next.",
    lessons: ["Completed records build your maintenance history.", "Vehicle details make repeat service easier.", "Keep history handy for resale, warranty, and planning."],
  },
  {
    id: "payments",
    title: "Track payments",
    icon: CreditCard,
    outcome: "Know where payment status, totals, and receipts live.",
    lessons: ["Payment history helps reconcile completed work.", "Review totals before asking for support.", "Use the portal as your receipt archive."],
  },
  {
    id: "rewards-offers",
    title: "Use rewards and coupons",
    icon: Gift,
    outcome: "Learn how to use loyalty points, reward catalog items, phone coupons, and coupon codes.",
    lessons: ["Copy coupon codes from Rewards & Offers.", "Reward progress shows what you are working toward.", "Phone-as-coupon offers may use your phone number at checkout."],
  },
  {
    id: "profile-security",
    title: "Keep profile data current",
    icon: User,
    outcome: "Understand why accurate email, phone, and profile information protects communication and offers.",
    lessons: ["Your phone may power loyalty coupons.", "Email is used to find your historical bookings.", "Updated contact info prevents missed service updates."],
  },
];

const readCompleted = () => {
  if (typeof window === "undefined") return new Set<string>();
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return new Set<string>(raw ? JSON.parse(raw) as string[] : []);
};

export function CustomerTrainingTab() {
  const [completed, setCompleted] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setCompleted(readCompleted());
  }, []);

  const completedCount = completed.size;
  const progress = useMemo(() => Math.round((completedCount / modules.length) * 100), [completedCount]);

  const toggleModule = (moduleId: string) => {
    setCompleted((current) => {
      const next = new Set(current);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(next)));
      return next;
    });
  };

  return (
    <div className="space-y-5">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-primary/10 p-3 text-primary">
                <Trophy className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold">Portal training</p>
                <p className="text-sm text-muted-foreground">Short walkthroughs to help you get more value from your customer portal.</p>
              </div>
            </div>
            <div className="min-w-[220px] space-y-2">
              <div className="flex justify-between text-sm">
                <span>{completedCount}/{modules.length} modules</span>
              </div>
              <Progress value={progress} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {modules.map((module) => {
          const Icon = module.icon;
          const isComplete = completed.has(module.id);
          return (
            <Card key={module.id} className={isComplete ? "border-emerald-500/30" : undefined}>
              <CardHeader>
                <CardTitle className="flex items-start justify-between gap-3 text-base">
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" /> {module.title}
                  </span>
                  {isComplete ? <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" /> Complete</Badge> : <Badge variant="outline">Training</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">{module.outcome}</p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {module.lessons.map((lesson) => <li key={lesson}>• {lesson}</li>)}
                </ul>
                <div className="flex flex-col gap-3 rounded-lg bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <ShieldCheck className="h-4 w-4 text-primary" /> Portal walkthrough
                  </div>
                  <Button size="sm" variant={isComplete ? "secondary" : "default"} onClick={() => toggleModule(module.id)}>
                    {isComplete ? "Completed" : "Mark complete"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

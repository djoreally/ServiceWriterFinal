import { Link, useSearchParams } from "react-router-dom";
import { safeNextPath } from "@/lib/auth/next-path";
import { Briefcase, Wrench, Radio, Shield, ChevronRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const ROLES = [
  {
    to: "/login/business",
    icon: Briefcase,
    title: "Business Owner",
    description: "Shop owners and admins managing the workspace, plans, and settings.",
  },
  {
    to: "/login/dispatch",
    icon: Radio,
    title: "Dispatch & Office Staff",
    description: "Dispatchers, managers, and front-desk staff running the daily board.",
  },
  {
    to: "/login/technician",
    icon: Wrench,
    title: "Technician",
    description: "Field technicians using the mobile tech app for jobs and check-ins.",
  },
  {
    to: "/admin/login",
    icon: Shield,
    title: "Platform Admin",
    description: "Service Writer platform administrators only.",
  },
] as const;

export default function LoginHub() {
  const [params] = useSearchParams();
  const nextPath = safeNextPath(params.toString());
  const withNext = (to: string) => (nextPath ? `${to}?next=${encodeURIComponent(nextPath)}` : to);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Sign in to Service Writer</h1>
          <p className="mt-2 text-muted-foreground">Choose the option that matches your role.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {ROLES.map(({ to, icon: Icon, title, description }) => (
            <Link key={to} to={withNext(to)} className="block">
              <Card className="h-full transition hover:border-primary hover:shadow-md">
                <CardHeader className="pb-2">
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="flex items-center justify-between text-lg">
                    {title}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{description}</CardDescription>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Prefer no password?{" "}
          <Link to="/login/magic-link" className="font-medium text-primary hover:underline">
            Email me a magic link
          </Link>
        </p>
        <p className="mt-3 text-center text-sm text-muted-foreground">
          New business owner?{" "}
          <Link to="/signup" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}

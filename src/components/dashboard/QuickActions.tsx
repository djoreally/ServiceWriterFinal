import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Car, FileText, UserPlus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTerminology } from "@/contexts/TerminologyContext";
import { useTeamRole } from "@/hooks/useTeamRole";
import { canWrite } from "@/domain/auth/access-policy";

export const QuickActions = () => {
  const navigate = useNavigate();
  const { terms } = useTerminology();
  const { role } = useTeamRole();

  const actions = [
    {
      icon: Car,
      label: "New Appointment",
      description: "Create an appointment for this vehicle",
      onClick: () => navigate("/appointments", { state: { openNewAppointment: true } }),
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
      visible: canWrite(role, "appointments"),
    },
    {
      icon: FileText,
      label: `Create ${terms.quote}`,
      description: "Draft a new quote",
      onClick: () => navigate("/quotes"),
      iconBg: "bg-gray-500/10",
      iconColor: "text-gray-600",
      visible: canWrite(role, "quotes"),
    },
    {
      icon: UserPlus,
      label: `Add ${terms.customer}`,
      description: "Register profile",
      onClick: () => navigate("/customers"),
      iconBg: "bg-yellow-500/10",
      iconColor: "text-yellow-600",
      visible: canWrite(role, "customers"),
    },
  ];

  return (
    <Card className="border border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {actions.filter((action) => action.visible).map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              onClick={action.onClick}
              className="w-full flex items-center gap-4 p-4 rounded-xl border border-border/50 hover:bg-muted/50 transition-colors text-left"
            >
              <div className={`p-3 rounded-xl ${action.iconBg}`}>
                <Icon className={`h-5 w-5 ${action.iconColor}`} />
              </div>
              <div>
                <p className="font-medium text-foreground">{action.label}</p>
                <p className="text-sm text-muted-foreground">{action.description}</p>
              </div>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
};

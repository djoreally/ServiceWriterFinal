import { Car, FileText, UserPlus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTerminology } from "@/contexts/TerminologyContext";
import { useTeamRole } from "@/hooks/useTeamRole";
import { canWrite } from "@/domain/auth/access-policy";
import { Button } from "@/components/ui/button";

export const QuickActions = () => {
  const navigate = useNavigate();
  const { terms } = useTerminology();
  const { role } = useTeamRole();

  const actions = [
    {
      icon: Car,
      label: "New Appointment",
      onClick: () => navigate("/appointments", { state: { openNewAppointment: true } }),
      primary: true,
      visible: canWrite(role, "appointments"),
    },
    {
      icon: FileText,
      label: `New ${terms.quote}`,
      onClick: () => navigate("/quotes"),
      primary: false,
      visible: canWrite(role, "quotes"),
    },
    {
      icon: UserPlus,
      label: `Add ${terms.customer}`,
      onClick: () => navigate("/customers"),
      primary: false,
      visible: canWrite(role, "customers"),
    },
  ];

  const visibleActions = actions.filter((action) => action.visible);
  if (visibleActions.length === 0) return null;

  return (
    <div aria-label="Quick actions" className="flex flex-wrap items-center gap-2">
      {visibleActions.map((action) => {
        const Icon = action.icon;
        return (
          <Button
            key={action.label}
            variant={action.primary ? "default" : "outline"}
            size="sm"
            onClick={action.onClick}
            className="gap-2"
          >
            <Icon className="h-4 w-4" />
            {action.label}
          </Button>
        );
      })}
    </div>
  );
};

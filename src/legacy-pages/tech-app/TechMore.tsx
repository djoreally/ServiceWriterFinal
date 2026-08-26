/**
 * TechMore — Account / Status hub
 * More tab contains Inventory, Account, Help, Settings.
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Package, User, Settings, LogOut, HelpCircle, Palette,
  ChevronRight, Truck, Clock, Star, Database, Wrench, Smartphone,
} from "lucide-react";
import {
  clockInCurrentTechnician,
  clockOutCurrentTechnician,
  signOutCurrentUser,
} from "@/application/commands/tech-app.command";
import { fetchTechMoreDataForCurrentUser } from "@/application/queries/tech-app.query";
import { toast } from "@/components/ui/sonner";
import { ThemeModeSelect } from "@/components/ThemeModeSelect";

interface TechProfile {
  id: string;
  name: string;
  email: string | null;
  status: string;
  performance_score: number | null;
  vans: { name: string } | null;
}



const SHIFT_STATUSES = ["Off Duty", "Available", "En Route", "On Job", "Break", "Unavailable"];

interface ClockEntry {
  id: string;
  clock_in: string;
  status: string;
}

export default function TechMore() {
  const navigate = useNavigate();
  const [tech, setTech] = useState<TechProfile | null>(null);
  const [clockEntry, setClockEntry] = useState<ClockEntry | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const { tech: techData, clockEntry: activeClockEntry } = await fetchTechMoreDataForCurrentUser();

    setTech((techData as unknown as TechProfile | null) ?? null);
    setClockEntry((activeClockEntry as unknown as ClockEntry | null) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleClockIn = async () => {
    const { error } = await clockInCurrentTechnician();
    if (error) {
      toast.error("Failed to clock in");
    } else {
      toast.success("Clocked in!");
      fetchData();
    }
  };

  const handleClockOut = async () => {
    const { error } = await clockOutCurrentTechnician();
    if (error) {
      toast.error("Failed to clock out");
    } else {
      toast.success("Clocked out!");
      setClockEntry(null);
      fetchData();
    }
  };

  const handleLogout = async () => {
    await signOutCurrentUser();
    navigate("/login");
  };

  const menuItems = [
    {
      icon: Wrench,
      label: "Service Records",
      description: "Log and review work performed",
      onClick: () => navigate("/tech-app/services"),
    },
    {
      icon: Clock,
      label: "Shift Status",
      description: "Clock in/out, breaks",
      onClick: () => navigate("/tech-app/shift"),
    },
    {
      icon: Database,
      label: "Data Center",
      description: "VIN decode, oil specs, filters",
      onClick: () => navigate("/tech-app/data-center"),
    },
    {
      icon: Package,
      label: "Inventory",
      description: "Van stock and parts",
      onClick: () => navigate("/tech-app/inventory"),
    },
    {
      icon: User,
      label: "My Profile",
      description: "Skills, certifications, performance",
      onClick: () => navigate("/tech-app/profile"),
    },
    {
      icon: Smartphone,
      label: "Field Companion",
      description: "Download the approved native guidance app",
      onClick: () => navigate("/field-companion"),
    },
    {
      icon: Settings,
      label: "Settings",
      description: "Theme, notifications, account",
      onClick: () => navigate("/tech-app/settings"),
    },
    {
      icon: HelpCircle,
      label: "Help & Support",
      description: "FAQs and contact dispatch",
      onClick: () => navigate("/support"),
    },
  ];

  return (
    <div className="p-4 space-y-4">
      {/* Profile Card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-md bg-primary/10 flex items-center justify-center">
              <User className="h-7 w-7 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-lg">{tech?.name || "Technician"}</h2>
              <p className="text-xs text-muted-foreground">Account / Status</p>
              {tech?.vans && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Truck className="h-3.5 w-3.5" />
                  <span>{tech.vans.name}</span>
                </div>
              )}
            </div>
            {tech?.performance_score != null && (
              <div className="text-right">
                <div className="flex items-center gap-1">
                  <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                  <span className="font-bold">{tech.performance_score.toFixed(0)}</span>
                </div>
                <span className="text-xs text-muted-foreground">Score</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Clock In/Out */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="font-medium">Time Clock</div>
                {clockEntry ? (
                  <div className="text-sm text-gray-600">
                    Clocked in • {clockEntry.status === "on_break" ? "On break" : "Active"}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">Not clocked in</div>
                )}
              </div>
            </div>
            {clockEntry ? (
              <Button variant="outline" onClick={handleClockOut}>
                Clock Out
              </Button>
            ) : (
              <Button onClick={handleClockIn}>
                Clock In
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Shift statuses for dispatch visibility */}
      <Card>
        <CardContent className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Shift statuses</p>
          <div className="flex flex-wrap gap-2">
            {SHIFT_STATUSES.map((status) => (
              <Badge key={status} variant="outline" className="text-[10px]">{status}</Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Menu Items */}
      <Card>
        <CardContent className="p-0">
          {menuItems.map((item, index) => (
            <div key={item.label}>
              {index > 0 && <Separator />}
              <button
                className="w-full flex items-center gap-3 p-4 hover:bg-accent/50 transition-colors text-left"
                onClick={item.onClick}
              >
                <item.icon className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <div className="font-medium">{item.label}</div>
                  <div className="text-sm text-muted-foreground">{item.description}</div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Settings */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Palette className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium">Theme mode</span>
            </div>
            <ThemeModeSelect />
          </div>
        </CardContent>
      </Card>

      {/* Logout */}
      <Button
        variant="outline"
        className="w-full h-12 text-destructive hover:text-destructive hover:bg-destructive/10"
        onClick={handleLogout}
      >
        <LogOut className="h-5 w-5 mr-2" />
        Sign Out
      </Button>

      {/* Version */}
      <p className="text-center text-xs text-muted-foreground">
        Tech App v1.0
      </p>
    </div>
  );
}

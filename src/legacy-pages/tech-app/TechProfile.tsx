/**
 * TechProfile — Technician's personal profile & account screen
 * 
 * Shows: name, email, skills, certifications, performance score, van assignment
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, User, Star, Truck, Shield, Award, Wrench,
  Mail, Phone, Loader2,
} from "lucide-react";
import { fetchTechProfileDataForCurrentUser } from "@/application/queries/tech-app.query";

interface TechProfileData {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  performance_score: number | null;
  customer_rating_avg: number | null;
  total_jobs_completed: number | null;
  vans: { name: string } | null;
}

interface TechSkill {
  id: string;
  skill_type: string;
  certification_level: string | null;
  is_active: boolean | null;
}

export default function TechProfile() {
  const navigate = useNavigate();
  const [tech, setTech] = useState<TechProfileData | null>(null);
  const [skills, setSkills] = useState<TechSkill[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    const { tech: techData, skills: skillsData } = await fetchTechProfileDataForCurrentUser();
    setTech((techData as unknown as TechProfileData | null) ?? null);
    setSkills((skillsData as unknown as TechSkill[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void Promise.resolve().then(() => fetchProfile()); }, [fetchProfile]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!tech) {
    return (
      <div className="p-4 text-center">
        <p className="text-muted-foreground">Profile not found</p>
        <Button variant="link" onClick={() => navigate("/tech-app")}>Back to Today</Button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/tech-app/more")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">My Profile</h1>
      </div>

      {/* Identity Card */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-md bg-primary/10 flex items-center justify-center">
              <User className="h-8 w-8 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold">{tech.name}</h2>
              <Badge variant={tech.status === "available" ? "default" : "secondary"}>
                {tech.status}
              </Badge>
            </div>
          </div>

          <Separator />

          <div className="space-y-2 text-sm">
            {tech.email && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-4 w-4" /> {tech.email}
              </div>
            )}
            {tech.phone && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-4 w-4" /> {tech.phone}
              </div>
            )}
            {tech.vans && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Truck className="h-4 w-4" /> {tech.vans.name}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Performance */}
      <Card>
        <CardContent className="p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Performance</h3>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-2xl font-bold text-primary">
                {tech.performance_score?.toFixed(0) ?? "—"}
              </div>
              <div className="text-xs text-muted-foreground">Score</div>
            </div>
            <div>
              <div className="text-2xl font-bold flex items-center justify-center gap-1">
                {tech.customer_rating_avg?.toFixed(1) ?? "—"}
                <Star className="h-4 w-4 text-amber-500" />
              </div>
              <div className="text-xs text-muted-foreground">Rating</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{tech.total_jobs_completed ?? 0}</div>
              <div className="text-xs text-muted-foreground">Jobs Done</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Skills */}
      {skills.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Skills & Certifications</h3>
            <div className="flex flex-wrap gap-2">
              {skills.map((skill) => (
                <Badge key={skill.id} variant="outline" className="gap-1.5">
                  <Wrench className="h-3 w-3" />
                  {skill.skill_type}
                  {skill.certification_level && (
                    <span className="text-muted-foreground">· {skill.certification_level}</span>
                  )}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * JobExecutionChecklist — Phase 2 unified execution steps.
 *
 * Renders the persisted `job_execution_checklists` steps for a job (retail or
 * fleet) and advances them through the server RPC. Photo-required steps upload
 * evidence first; the server refuses completion without it, so this UI cannot
 * fake completion state.
 */

import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Camera, Check, ClipboardCheck, Loader2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/sonner";
import type { JobExecutionStep } from "@/application/queries/tech-app.query";
import { advanceJobExecutionStep, uploadTechJobPhoto } from "@/application/commands/tech-app.command";

interface JobExecutionChecklistProps {
  jobId: string;
  businessUserId: string;
  steps: JobExecutionStep[];
  onChanged: () => void | Promise<void>;
}

const STATUS_LABEL: Record<JobExecutionStep["status"], string> = {
  pending: "Pending",
  in_progress: "In progress",
  completed: "Done",
  blocked: "Blocked",
};

export function JobExecutionChecklist({ jobId, businessUserId, steps, onChanged }: JobExecutionChecklistProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingStepId, setPendingStepId] = useState<string | null>(null);
  const [photoStep, setPhotoStep] = useState<JobExecutionStep | null>(null);

  const requiredOpen = steps.filter((s) => s.is_required && s.status !== "completed");
  const completedCount = steps.filter((s) => s.status === "completed").length;

  const advance = async (step: JobExecutionStep, status: JobExecutionStep["status"], evidenceUrl?: string) => {
    setPendingStepId(step.id);
    const { error } = await advanceJobExecutionStep({ stepId: step.id, status, evidenceUrl });
    setPendingStepId(null);

    if (error) {
      toast.error(error);
      return;
    }
    await onChanged();
  };

  const handleEvidenceSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const step = photoStep;
    if (fileInputRef.current) fileInputRef.current.value = "";
    setPhotoStep(null);
    if (!file || !step) return;

    setPendingStepId(step.id);
    try {
      const { data: photoRecord, error } = await uploadTechJobPhoto({
        appointmentId: jobId,
        businessUserId,
        photoType: step.step_key,
        isRequired: step.is_required,
        file,
      });
      if (error || !photoRecord) throw error || new Error("Evidence upload failed");

      const evidenceUrl = (photoRecord as { storage_path?: string }).storage_path;
      setPendingStepId(null);
      await advance(step, "completed", evidenceUrl);
    } catch (uploadError) {
      setPendingStepId(null);
      toast.error(uploadError instanceof Error ? uploadError.message : "Evidence upload failed");
    }
  };

  if (!steps.length) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" />
            Execution Steps
          </span>
          <Badge variant={requiredOpen.length ? "destructive" : "secondary"}>
            {completedCount}/{steps.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {requiredOpen.length > 0 && (
          <p className="flex items-start gap-2 rounded-md bg-destructive/5 p-2 text-xs text-destructive">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {requiredOpen.length} required step{requiredOpen.length === 1 ? "" : "s"} must be finished before this job can be
            completed.
          </p>
        )}

        {steps.map((step) => {
          const isDone = step.status === "completed";
          const isPending = pendingStepId === step.id;
          return (
            <div
              key={step.id}
              className={cn(
                "flex items-center justify-between gap-3 rounded-md border p-2",
                isDone && "border-primary/40 bg-primary/5",
                step.status === "blocked" && "border-destructive/40 bg-destructive/5",
              )}
            >
              <div className="min-w-0">
                <p className={cn("text-sm font-medium truncate", isDone && "line-through opacity-70")}>{step.step_name}</p>
                <p className="text-xs text-muted-foreground">
                  {STATUS_LABEL[step.status]}
                  {step.requires_photo ? " • photo required" : ""}
                  {step.is_required ? "" : " • optional"}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isDone ? (
                  <Button variant="ghost" size="sm" onClick={() => advance(step, "pending")}>
                    Undo
                  </Button>
                ) : step.requires_photo && !step.evidence_url ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setPhotoStep(step);
                      fileInputRef.current?.click();
                    }}
                  >
                    <Camera className="mr-1 h-4 w-4" />
                    Capture
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => advance(step, "completed")}>
                    <Check className="mr-1 h-4 w-4" />
                    Done
                  </Button>
                )}
              </div>
            </div>
          );
        })}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleEvidenceSelected}
        />
      </CardContent>
    </Card>
  );
}

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Minus,
  Pencil,
  Trash2,
  Plus,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface InspectionFinding {
  id: string;
  category: string;
  item_name: string;
  status: "pass" | "fail" | "warning" | "not_applicable";
  severity: "good" | "attention" | "urgent";
  notes: string;
  measurement: string | null;
}

interface TranscriptReviewProps {
  /** Raw transcript text */
  transcript: string;
  /** AI-parsed findings */
  findings: InspectionFinding[];
  /** AI summary */
  summary: string;
  /** Called when user confirms the reviewed findings */
  onConfirm: (findings: InspectionFinding[], transcript: string) => void;
  /** Called to go back */
  onBack: () => void;
  /** Loading state */
  isLoading?: boolean;
}

const CATEGORY_OPTIONS = [
  "engine", "brakes", "suspension", "fluids", "electrical",
  "exterior", "interior", "tires", "exhaust", "drivetrain", "steering", "other",
];

const STATUS_CONFIG = {
  pass: { label: "Pass", icon: CheckCircle2, color: "text-gray-600", bg: "bg-green-50 dark:bg-green-950" },
  fail: { label: "Fail", icon: XCircle, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950" },
  warning: { label: "Warning", icon: AlertTriangle, color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-950" },
  not_applicable: { label: "N/A", icon: Minus, color: "text-muted-foreground", bg: "bg-muted" },
};

const SEVERITY_COLORS = {
  good: "bg-gray-100 text-gray-800 dark:bg-green-900 dark:text-green-200",
  attention: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  urgent: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

/**
 * Review and edit AI-parsed inspection findings before saving.
 * The technician can modify, add, or remove findings.
 */
export function TranscriptReview({
  transcript,
  findings: initialFindings,
  summary,
  onConfirm,
  onBack,
  isLoading,
}: TranscriptReviewProps) {
  const [findings, setFindings] = useState<InspectionFinding[]>(initialFindings);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);

  const updateFinding = useCallback((id: string, updates: Partial<InspectionFinding>) => {
    setFindings((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...updates } : f))
    );
  }, []);

  const removeFinding = useCallback((id: string) => {
    setFindings((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const addFinding = useCallback(() => {
    const newFinding: InspectionFinding = {
      id: `manual-${Date.now()}`,
      category: "other",
      item_name: "New Finding",
      status: "warning",
      severity: "attention",
      notes: "",
      measurement: null,
    };
    setFindings((prev) => [...prev, newFinding]);
    setEditingId(newFinding.id);
  }, []);

  const categoryGroups = findings.reduce<Record<string, InspectionFinding[]>>((acc, f) => {
    if (!acc[f.category]) acc[f.category] = [];
    acc[f.category].push(f);
    return acc;
  }, {});

  const passCount = findings.filter((f) => f.status === "pass").length;
  const warnCount = findings.filter((f) => f.status === "warning").length;
  const failCount = findings.filter((f) => f.status === "fail").length;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="gap-1 bg-green-50 dark:bg-green-950">
                <CheckCircle2 className="h-3 w-3 text-gray-600" />
                {passCount} Pass
              </Badge>
              <Badge variant="outline" className="gap-1 bg-yellow-50 dark:bg-yellow-950">
                <AlertTriangle className="h-3 w-3 text-yellow-600" />
                {warnCount} Warning
              </Badge>
              <Badge variant="outline" className="gap-1 bg-red-50 dark:bg-red-950">
                <XCircle className="h-3 w-3 text-red-600" />
                {failCount} Fail
              </Badge>
            </div>
            <span className="text-sm text-muted-foreground">
              {findings.length} findings total
            </span>
          </div>
          {summary && (
            <p className="text-sm text-muted-foreground mt-2 italic">{summary}</p>
          )}
        </CardContent>
      </Card>

      {/* Transcript toggle */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowTranscript(!showTranscript)}
        className="gap-2"
      >
        <FileText className="h-4 w-4" />
        {showTranscript ? "Hide" : "Show"} Raw Transcript
      </Button>
      {showTranscript && (
        <Card>
          <CardContent className="py-3 px-4">
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">{transcript}</p>
          </CardContent>
        </Card>
      )}

      {/* Findings by category */}
      {Object.entries(categoryGroups).map(([category, items]) => (
        <Card key={category}>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium capitalize">{category}</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-2">
            {items.map((finding) => {
              const statusCfg = STATUS_CONFIG[finding.status];
              const StatusIcon = statusCfg.icon;
              const isEditing = editingId === finding.id;

              return (
                <div
                  key={finding.id}
                  className={cn(
                    "rounded-lg border p-3 transition-colors",
                    statusCfg.bg
                  )}
                >
                  {isEditing ? (
                    /* Edit mode */
                    <div className="space-y-2">
                      <Input
                        value={finding.item_name}
                        onChange={(e) => updateFinding(finding.id, { item_name: e.target.value })}
                        placeholder="Component name"
                        className="font-medium"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Select
                          value={finding.status}
                          onValueChange={(v) =>
                            updateFinding(finding.id, {
                              status: v as InspectionFinding["status"],
                              severity:
                                v === "pass"
                                  ? "good"
                                  : v === "fail"
                                  ? "urgent"
                                  : "attention",
                            })
                          }
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pass">Pass</SelectItem>
                            <SelectItem value="warning">Warning</SelectItem>
                            <SelectItem value="fail">Fail</SelectItem>
                            <SelectItem value="not_applicable">N/A</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select
                          value={finding.category}
                          onValueChange={(v) => updateFinding(finding.id, { category: v })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CATEGORY_OPTIONS.map((c) => (
                              <SelectItem key={c} value={c} className="capitalize">
                                {c}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Input
                        value={finding.measurement || ""}
                        onChange={(e) =>
                          updateFinding(finding.id, {
                            measurement: e.target.value || null,
                          })
                        }
                        placeholder="Measurement (optional)"
                      />
                      <Textarea
                        value={finding.notes}
                        onChange={(e) => updateFinding(finding.id, { notes: e.target.value })}
                        placeholder="Notes"
                        rows={2}
                      />
                      <Button
                        size="sm"
                        onClick={() => setEditingId(null)}
                      >
                        Done
                      </Button>
                    </div>
                  ) : (
                    /* View mode */
                    <div className="flex items-start gap-3">
                      <StatusIcon className={cn("h-5 w-5 mt-0.5 shrink-0", statusCfg.color)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{finding.item_name}</span>
                          <Badge className={cn("text-[10px]", SEVERITY_COLORS[finding.severity])}>
                            {finding.severity}
                          </Badge>
                          {finding.measurement && (
                            <Badge variant="outline" className="text-[10px]">
                              {finding.measurement}
                            </Badge>
                          )}
                        </div>
                        {finding.notes && (
                          <p className="text-xs text-muted-foreground mt-1">{finding.notes}</p>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setEditingId(finding.id)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => removeFinding(finding.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      {/* No findings */}
      {findings.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No findings parsed. Add findings manually or re-record.
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button variant="outline" onClick={addFinding} className="gap-1">
            <Plus className="h-4 w-4" />
            Add Finding
          </Button>
        </div>
        <Button
          onClick={() => onConfirm(findings, transcript)}
          disabled={isLoading || findings.length === 0}
          className="gap-2"
        >
          {isLoading ? "Saving..." : "Save Inspection Report"}
        </Button>
      </div>
    </div>
  );
}

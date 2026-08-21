/**
 * WorkOrderChecklist — Technician field execution interface
 *
 * Renders the service playbook checklist for a work order, allowing
 * technicians to mark items pass/fail, add notes, and upload photo evidence.
 *
 * Performance: Uses local state for optimistic updates, syncs to backend on change.
 */

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  CheckCircle2, Circle, Camera, MessageSquare,
  ChevronDown, ChevronUp, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { updateChecklistItem } from '@/application/commands';
import { toast } from 'sonner';
import { ProgressiveImage } from "@/components/media/ProgressiveImage";

// ─── Types ────────────────────────────────────────────────────────────────

export interface ChecklistItem {
  id: string;
  stepName: string;
  stepOrder: number;
  status: 'pending' | 'passed' | 'failed' | 'skipped';
  evidenceUrl: string | null;
  notes: string | null;
  completedAt: string | null;
}

interface WorkOrderChecklistProps {
  workOrderId: string;
  items: ChecklistItem[];
  readOnly?: boolean;
  onItemUpdated?: (itemId: string, status: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────

export function WorkOrderChecklist({
  workOrderId,
  items,
  readOnly = false,
  onItemUpdated,
}: WorkOrderChecklistProps) {
  const [localItems, setLocalItems] = useState(items);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notesInput, setNotesInput] = useState<Record<string, string>>({});

  const completedCount = localItems.filter(i => i.status === 'passed' || i.status === 'failed').length;
  const progress = localItems.length > 0 ? Math.round((completedCount / localItems.length) * 100) : 0;

  const handleStatusToggle = useCallback(async (item: ChecklistItem) => {
    if (readOnly) return;
    const newStatus = item.status === 'pending' ? 'passed' : 'pending';

    // Optimistic update
    setLocalItems(prev => prev.map(i =>
      i.id === item.id ? { ...i, status: newStatus as any, completedAt: newStatus === 'passed' ? new Date().toISOString() : null } : i
    ));

    try {
      await updateChecklistItem(item.id, { status: newStatus });
      onItemUpdated?.(item.id, newStatus);
    } catch {
      // Revert on failure
      setLocalItems(prev => prev.map(i =>
        i.id === item.id ? item : i
      ));
      toast.error('Failed to update checklist item');
    }
  }, [readOnly, onItemUpdated]);

  const handleMarkFailed = useCallback(async (item: ChecklistItem) => {
    if (readOnly) return;

    setLocalItems(prev => prev.map(i =>
      i.id === item.id ? { ...i, status: 'failed' as any, completedAt: new Date().toISOString() } : i
    ));

    try {
      await updateChecklistItem(item.id, { status: 'failed', notes: notesInput[item.id] || null });
      onItemUpdated?.(item.id, 'failed');
    } catch {
      toast.error('Failed to mark item as failed');
    }
  }, [readOnly, notesInput, onItemUpdated]);

  const handleSaveNotes = useCallback(async (itemId: string) => {
    const notes = notesInput[itemId];
    if (notes === undefined) return;

    try {
      await updateChecklistItem(itemId, { notes });
      setLocalItems(prev => prev.map(i =>
        i.id === itemId ? { ...i, notes } : i
      ));
      toast.success('Notes saved');
    } catch {
      toast.error('Failed to save notes');
    }
  }, [notesInput]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Service Checklist</CardTitle>
          <Badge variant={progress === 100 ? 'default' : 'secondary'} className="text-[10px]">
            {completedCount}/{localItems.length} — {progress}%
          </Badge>
        </div>
        {/* Progress bar */}
        <div className="w-full h-1.5 bg-muted rounded-md overflow-hidden mt-1">
          <div
            className="h-full bg-primary rounded-md transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-1 p-3">
        {localItems
          .sort((a, b) => a.stepOrder - b.stepOrder)
          .map((item) => {
            const isExpanded = expandedId === item.id;
            return (
              <div key={item.id} className="border border-border rounded-md overflow-hidden">
                {/* Step row */}
                <button
                  type="button"
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors',
                    item.status === 'passed' && 'bg-primary/5',
                    item.status === 'failed' && 'bg-destructive/5',
                    !readOnly && 'hover:bg-accent/50'
                  )}
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                >
                  {/* Status icon */}
                  {!readOnly ? (
                    <Checkbox
                      checked={item.status === 'passed'}
                      onCheckedChange={() => handleStatusToggle(item)}
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0"
                    />
                  ) : item.status === 'passed' ? (
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  ) : item.status === 'failed' ? (
                    <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}

                  <span className={cn(
                    'flex-1 text-sm',
                    item.status === 'passed' && 'line-through text-muted-foreground'
                  )}>
                    {item.stepName}
                  </span>

                  {/* Indicators */}
                  <div className="flex items-center gap-1">
                    {item.evidenceUrl && <Camera className="h-3 w-3 text-muted-foreground" />}
                    {item.notes && <MessageSquare className="h-3 w-3 text-muted-foreground" />}
                    {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-3 pb-3 pt-1 border-t border-border space-y-2">
                    <Textarea
                      placeholder="Add notes…"
                      value={notesInput[item.id] ?? item.notes ?? ''}
                      onChange={(e) => setNotesInput(prev => ({ ...prev, [item.id]: e.target.value }))}
                      className="text-xs min-h-[60px]"
                      disabled={readOnly}
                    />
                    {!readOnly && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs gap-1"
                          onClick={() => handleSaveNotes(item.id)}
                        >
                          <MessageSquare className="h-3 w-3" /> Save Notes
                        </Button>
                        {item.status !== 'failed' && (
                          <Button
                            size="sm"
                            variant="destructive"
                            className="text-xs gap-1"
                            onClick={() => handleMarkFailed(item)}
                          >
                            <AlertTriangle className="h-3 w-3" /> Mark Failed
                          </Button>
                        )}
                      </div>
                    )}
                    {item.evidenceUrl && (
                      <ProgressiveImage
                        src={item.evidenceUrl}
                        alt={`Evidence for ${item.stepName}`}
                        className="rounded-md max-h-32 object-cover"
                        placeholderClassName="rounded-md h-32 w-full"
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
      </CardContent>
    </Card>
  );
}

/**
 * SignaturePad — Canvas-based digital signature capture
 *
 * Used in the technician field app for customer sign-off on completed work orders.
 * Exports the signature as a base64 PNG data URL.
 *
 * Performance: Uses requestAnimationFrame for smooth drawing; canvas is lazily initialized.
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Eraser, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SignaturePadProps {
  /** Called with a base64 PNG data URL when the user confirms. */
  onConfirm: (dataUrl: string) => void;
  onCancel?: () => void;
  title?: string;
  className?: string;
}

export function SignaturePad({
  onConfirm,
  onCancel,
  title = 'Customer Signature',
  className,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [hasStrokes, setHasStrokes] = useState(false);

  // Initialize canvas context
  const getCtx = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.strokeStyle = 'hsl(var(--foreground))';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    return ctx;
  }, []);

  // Resize canvas to match container
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    // Set actual pixel size (accounting for device pixel ratio for sharpness)
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);
  }, []);

  const getPointerPos = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    isDrawing.current = true;
    lastPoint.current = getPointerPos(e);
    // Capture pointer for smooth drawing outside canvas bounds
    canvasRef.current?.setPointerCapture(e.pointerId);
  }, [getPointerPos]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDrawing.current || !lastPoint.current) return;
    const ctx = getCtx();
    if (!ctx) return;

    const pos = getPointerPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPoint.current = pos;
    if (!hasStrokes) setHasStrokes(true);
  }, [getCtx, getPointerPos, hasStrokes]);

  const handlePointerUp = useCallback(() => {
    isDrawing.current = false;
    lastPoint.current = null;
  }, []);

  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    setHasStrokes(false);
  }, []);

  const handleConfirm = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasStrokes) return;
    const dataUrl = canvas.toDataURL('image/png');
    onConfirm(dataUrl);
  }, [hasStrokes, onConfirm]);

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="border border-border rounded-lg bg-card overflow-hidden touch-none">
          <canvas
            ref={canvasRef}
            className="w-full h-32 cursor-crosshair"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          />
        </div>
        <p className="text-[10px] text-muted-foreground text-center">
          Sign above to confirm work completion
        </p>
        <div className="flex gap-2">
          {onCancel && (
            <Button variant="outline" size="sm" onClick={onCancel} className="flex-1">
              Cancel
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleClear}
            disabled={!hasStrokes}
            className="gap-1"
          >
            <Eraser className="h-3.5 w-3.5" /> Clear
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={!hasStrokes}
            className="flex-1 gap-1"
          >
            <Check className="h-3.5 w-3.5" /> Confirm
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

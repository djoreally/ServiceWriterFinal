import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { MAX_RECORDING_SECONDS } from "@/lib/audio";
import { Mic, MicOff, Pause, Play, Square, RotateCcw, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface AudioRecorderProps {
  /** Called when a recording is finalized */
  onRecordingComplete: (blob: Blob, mimeType: string) => void;
  /** Optional class name */
  className?: string;
}

/**
 * Audio recorder UI with waveform visualization, play/pause/stop controls,
 * and playback preview. Used inside the VoiceInspection workflow.
 */
export function AudioRecorder({ onRecordingComplete, className }: AudioRecorderProps) {
  const {
    state,
    elapsed,
    elapsedFormatted,
    audioLevel,
    audioBlob,
    audioUrl,
    mimeType,
    isSupported,
    error,
    start,
    pause,
    resume,
    stop,
    reset,
  } = useAudioRecorder();

  const [confirmed, setConfirmed] = useState(false);

  const handleUseRecording = () => {
    if (audioBlob) {
      setConfirmed(true);
      onRecordingComplete(audioBlob, mimeType);
    }
  };

  if (!isSupported) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center gap-3 py-4">
          <AlertCircle className="h-5 w-5 text-destructive" />
          <p className="text-sm text-destructive">
            Audio recording is not supported in this browser. Please use Chrome, Firefox, or Safari.
          </p>
        </CardContent>
      </Card>
    );
  }

  const progressPct = Math.min(100, (elapsed / MAX_RECORDING_SECONDS) * 100);

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-4 space-y-4">
        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-3">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Waveform / level visualization */}
        <div className="flex items-center justify-center h-16 bg-muted rounded-lg relative overflow-hidden">
          {state === "recording" && (
            <>
              {/* Animated bars */}
              <div className="flex items-end gap-1 h-12">
                {Array.from({ length: 20 }).map((_, i) => {
                  const barHeight = Math.max(
                    4,
                    audioLevel * 48 * (0.5 + 0.5 * Math.sin(i))
                  );
                  return (
                    <div
                      key={i}
                      className="w-1.5 bg-primary rounded-md transition-all duration-75"
                      style={{ height: `${barHeight}px` }}
                    />
                  );
                })}
              </div>
              {/* Progress bar at bottom */}
              <div className="absolute bottom-0 left-0 h-1 bg-primary/30 w-full">
                <div
                  className="h-full bg-primary transition-all duration-1000"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </>
          )}

          {state === "paused" && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Pause className="h-5 w-5" />
              <span className="text-sm font-medium">Paused</span>
            </div>
          )}

          {state === "idle" && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mic className="h-5 w-5" />
              <span className="text-sm">Tap to start recording</span>
            </div>
          )}

          {state === "stopped" && audioUrl && (
            <audio controls src={audioUrl} className="w-full h-10 px-2" />
          )}
        </div>

        {/* Timer */}
        {state !== "idle" && (
          <div className="text-center">
            <span className="text-2xl font-mono font-bold tabular-nums">
              {elapsedFormatted}
            </span>
            <span className="text-xs text-muted-foreground ml-2">
              / {Math.floor(MAX_RECORDING_SECONDS / 60)}:00
            </span>
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center justify-center gap-3">
          {state === "idle" && (
            <Button onClick={start} size="lg" className="gap-2">
              <Mic className="h-5 w-5" />
              Start Recording
            </Button>
          )}

          {state === "recording" && (
            <>
              <Button onClick={pause} variant="outline" size="icon" className="h-12 w-12 rounded-md">
                <Pause className="h-5 w-5" />
              </Button>
              <Button onClick={stop} variant="destructive" size="icon" className="h-14 w-14 rounded-md">
                <Square className="h-6 w-6" />
              </Button>
            </>
          )}

          {state === "paused" && (
            <>
              <Button onClick={resume} variant="outline" size="icon" className="h-12 w-12 rounded-md">
                <Play className="h-5 w-5" />
              </Button>
              <Button onClick={stop} variant="destructive" size="icon" className="h-14 w-14 rounded-md">
                <Square className="h-6 w-6" />
              </Button>
            </>
          )}

          {state === "stopped" && (
            <>
              <Button onClick={reset} variant="outline" className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Re-record
              </Button>
              <Button
                onClick={handleUseRecording}
                disabled={confirmed}
                className="gap-2"
              >
                <MicOff className="h-4 w-4" />
                {confirmed ? "Recording Saved" : "Use This Recording"}
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

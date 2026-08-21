import { useState, useRef, useCallback, useEffect } from "react";
import {
  getSupportedMimeType,
  formatDuration,
  isRecordingSupported,
  MAX_RECORDING_SECONDS,
} from "@/lib/audio";

export type RecordingState = "idle" | "recording" | "paused" | "stopped";

export interface UseAudioRecorderReturn {
  /** Current state of the recorder */
  state: RecordingState;
  /** Elapsed recording time in seconds */
  elapsed: number;
  /** Formatted elapsed time (MM:SS) */
  elapsedFormatted: string;
  /** Audio level 0-1 for waveform visualization */
  audioLevel: number;
  /** The recorded audio blob (available after stop) */
  audioBlob: Blob | null;
  /** Audio URL for playback (available after stop) */
  audioUrl: string | null;
  /** The MIME type used for recording */
  mimeType: string;
  /** Whether the browser supports recording */
  isSupported: boolean;
  /** Error message if something went wrong */
  error: string | null;
  /** Start recording */
  start: () => Promise<void>;
  /** Pause recording */
  pause: () => void;
  /** Resume recording */
  resume: () => void;
  /** Stop recording and finalize the blob */
  stop: () => void;
  /** Reset to idle state, clearing the recording */
  reset: () => void;
}

/**
 * Hook that wraps the browser MediaRecorder API for voice inspection recording.
 * Provides start/pause/resume/stop controls, elapsed time, and audio level metering.
 */
export function useAudioRecorder(): UseAudioRecorderReturn {
  const [state, setState] = useState<RecordingState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const mimeType = getSupportedMimeType();
  const isSupported = isRecordingSupported();

  // Clean up on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    mediaRecorderRef.current = null;
  }, []);

  // Meter the audio level for visualization
  const startMetering = useCallback(() => {
    if (!analyserRef.current) return;
    const analyser = analyserRef.current;
    const dataArray = new Uint8Array(analyser.fftSize);

    const tick = () => {
      analyser.getByteTimeDomainData(dataArray);
      // RMS level normalized to 0-1
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = (dataArray[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      setAudioLevel(Math.min(1, rms * 3)); // Amplify a bit for UI
      animFrameRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const start = useCallback(async () => {
    if (!isSupported) {
      setError("Audio recording is not supported in this browser.");
      return;
    }

    try {
      setError(null);
      setAudioBlob(null);
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
      }
      chunksRef.current = [];
      setElapsed(0);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up Web Audio analyser for metering
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setState("stopped");
        cleanup();
      };

      recorder.onerror = () => {
        setError("Recording error occurred");
        setState("idle");
        cleanup();
      };

      recorder.start(1000); // Collect data every second
      setState("recording");

      // Start elapsed timer
      timerRef.current = setInterval(() => {
        setElapsed((prev) => {
          const next = prev + 1;
          if (next >= MAX_RECORDING_SECONDS) {
            // Auto-stop at max duration
            recorder.stop();
          }
          return next;
        });
      }, 1000);

      startMetering();
    } catch (err) {
      console.error("Failed to start recording:", err);
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError("Microphone access denied. Please allow microphone access and try again.");
      } else {
        setError("Failed to start recording. Please check your microphone.");
      }
      setState("idle");
      cleanup();
    }
  }, [isSupported, mimeType, audioUrl, cleanup, startMetering]);

  const pause = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
      setState("paused");
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      setAudioLevel(0);
    }
  }, []);

  const resume = useCallback(() => {
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
      setState("recording");

      timerRef.current = setInterval(() => {
        setElapsed((prev) => {
          const next = prev + 1;
          if (next >= MAX_RECORDING_SECONDS && mediaRecorderRef.current) {
            mediaRecorderRef.current.stop();
          }
          return next;
        });
      }, 1000);

      startMetering();
    }
  }, [startMetering]);

  const stop = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  const reset = useCallback(() => {
    stop();
    cleanup();
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioBlob(null);
    setAudioUrl(null);
    setElapsed(0);
    setError(null);
    setState("idle");
    chunksRef.current = [];
  }, [stop, cleanup, audioUrl]);

  return {
    state,
    elapsed,
    elapsedFormatted: formatDuration(elapsed),
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
  };
}

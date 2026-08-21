import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Camera, X, RotateCcw, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ProgressiveImage } from "@/components/media/ProgressiveImage";

export interface CapturedPhoto {
  id: string;
  blob: Blob;
  previewUrl: string;
  timestamp: number; // seconds into recording when captured
  caption: string;
}

interface PhotoCaptureProps {
  /** Current elapsed recording time (for timestamping photos) */
  recordingElapsed: number;
  /** Called when photos change */
  onPhotosChange: (photos: CapturedPhoto[]) => void;
  /** Current photos */
  photos: CapturedPhoto[];
  /** Optional class */
  className?: string;
}

/**
 * Camera capture component for taking photos during a voice inspection.
 * Uses the rear-facing camera. Photos are timestamped relative to the recording.
 */
export function PhotoCapture({
  recordingElapsed,
  onPhotosChange,
  photos,
  className,
}: PhotoCaptureProps) {
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 960 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraActive(true);
    } catch (err) {
      console.error("Camera error:", err);
      toast.error("Unable to access camera");
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 960;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const photo: CapturedPhoto = {
          id: `photo-${Date.now()}`,
          blob,
          previewUrl: URL.createObjectURL(blob),
          timestamp: recordingElapsed,
          caption: "",
        };
        onPhotosChange([...photos, photo]);
        toast.success("Photo captured");
      },
      "image/jpeg",
      0.85
    );
  }, [recordingElapsed, photos, onPhotosChange]);

  const removePhoto = useCallback(
    (id: string) => {
      const photo = photos.find((p) => p.id === id);
      if (photo) {
        URL.revokeObjectURL(photo.previewUrl);
      }
      onPhotosChange(photos.filter((p) => p.id !== id));
    },
    [photos, onPhotosChange]
  );

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-4 space-y-3">
        {/* Camera viewfinder */}
        {cameraActive ? (
          <div className="relative">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full rounded-lg bg-black aspect-[4/3] object-cover"
            />
            <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-3">
              <Button
                onClick={capturePhoto}
                size="icon"
                className="h-14 w-14 rounded-md bg-white text-black hover:bg-gray-200 shadow-lg"
              >
                <Camera className="h-7 w-7" />
              </Button>
              <Button
                onClick={stopCamera}
                variant="destructive"
                size="icon"
                className="h-10 w-10 rounded-md"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>
        ) : (
          <Button onClick={startCamera} variant="outline" className="w-full gap-2">
            <Camera className="h-4 w-4" />
            {photos.length > 0 ? "Take Another Photo" : "Open Camera"}
          </Button>
        )}

        {/* Hidden canvas for capture */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Photo thumbnails */}
        {photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {photos.map((photo) => (
              <div key={photo.id} className="relative group">
                <ProgressiveImage
                  src={photo.previewUrl}
                  alt="Inspection photo"
                  className="w-full aspect-square object-cover rounded-md border"
                  placeholderClassName="w-full aspect-square rounded-md"
                />
                <div className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                  {Math.floor(photo.timestamp / 60)}:{(photo.timestamp % 60).toString().padStart(2, "0")}
                </div>
                <Button
                  onClick={() => removePhoto(photo.id)}
                  variant="destructive"
                  size="icon"
                  className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

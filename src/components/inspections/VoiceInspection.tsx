import { useState, useCallback } from "react";
import {
  getInspectionMediaSignedUrl,
} from "@/application/queries/voice-inspection.query";
import {
  invokeTranscribeAudio,
  uploadInspectionMedia,
  insertServiceInspection,
  insertInspectionResults,
} from "@/application/commands/voice-inspection.command";
import { useAuth } from "@packages/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Mic, Camera, Brain, Save, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { AudioRecorder } from "./AudioRecorder";
import { PhotoCapture, type CapturedPhoto } from "./PhotoCapture";
import { TranscriptReview, type InspectionFinding } from "./TranscriptReview";
import { audioToFile, getExtensionForMime } from "@/lib/audio";

type WorkflowStep = "record" | "transcribing" | "review" | "saving" | "done";

interface VoiceInspectionProps {
  /** Service ID (optional — can be used standalone) */
  serviceId?: string;
  /** Vehicle ID */
  vehicleId?: string;
  /** Vehicle info string for AI context */
  vehicleInfo?: string;
  /** Called when the inspection is saved */
  onComplete?: (inspectionId: string) => void;
  /** Called to go back / close */
  onCancel?: () => void;
}

/**
 * Full voice inspection workflow:
 * 1. Record audio narration + capture photos
 * 2. Upload audio → AI transcribes & structures
 * 3. Technician reviews/edits AI findings
 * 4. Save to database
 */
export function VoiceInspection({
  serviceId,
  vehicleId,
  vehicleInfo = "",
  onComplete,
  onCancel,
}: VoiceInspectionProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<WorkflowStep>("record");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioMimeType, setAudioMimeType] = useState("audio/webm");
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [recordingElapsed, setRecordingElapsed] = useState(0);

  // Transcription results
  const [transcript, setTranscript] = useState("");
  const [findings, setFindings] = useState<InspectionFinding[]>([]);
  const [summary, setSummary] = useState("");
  const [saving, setSaving] = useState(false);

  const handleRecordingComplete = useCallback((blob: Blob, mimeType: string) => {
    setAudioBlob(blob);
    setAudioMimeType(mimeType);
  }, []);

  /**
   * Upload audio + send to transcription edge function
   */
  const handleTranscribe = useCallback(async () => {
    if (!audioBlob || !user) return;

    setStep("transcribing");

    try {
      // Convert blob to base64
      const arrayBuffer = await audioBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < uint8Array.length; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      const audioBase64 = btoa(binary);

      const { data, error } = await invokeTranscribeAudio(audioBase64, audioMimeType, vehicleInfo);

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setTranscript(data.transcript || "");
      setSummary(data.summary || "");

      // Map findings with IDs
      const parsedFindings: InspectionFinding[] = (data.findings || []).map(
        (f: Omit<InspectionFinding, "id">, idx: number) => ({
          ...f,
          id: `ai-${idx}-${Date.now()}`,
        })
      );
      setFindings(parsedFindings);

      if (parsedFindings.length === 0 && data.transcript) {
        toast.info("Audio transcribed but no specific findings found. You can add findings manually.");
      } else {
        toast.success(`Transcribed ${parsedFindings.length} findings`);
      }

      setStep("review");
    } catch (err) {
      console.error("Transcription error:", err);
      toast.error("Failed to transcribe audio. Please try again.");
      setStep("record");
    }
  }, [audioBlob, audioMimeType, user, vehicleInfo]);

  /**
   * Save the inspection to the database
   */
  const handleSave = useCallback(
    async (confirmedFindings: InspectionFinding[], confirmedTranscript: string) => {
      if (!user) return;
      setSaving(true);
      setStep("saving");

      try {
        // 1. Upload audio to Supabase Storage
        let audioUrl: string | null = null;
        if (audioBlob) {
          const ext = getExtensionForMime(audioMimeType);
          const audioPath = `${user.id}/${Date.now()}-inspection.${ext}`;
          const audioFile = audioToFile(audioBlob, audioMimeType);

          const { error: uploadErr } = await uploadInspectionMedia(audioPath, audioFile);

          if (uploadErr) {
            console.error("Audio upload error:", uploadErr);
          } else {
            const { data: signedData } = await getInspectionMediaSignedUrl(audioPath);
            audioUrl = signedData?.signedUrl || audioPath;
          }
        }

        // 2. Upload photos to Supabase Storage
        const photoUrls: { url: string; timestamp: number }[] = [];
        for (const photo of photos) {
          const photoPath = `${user.id}/${Date.now()}-${photo.id}.jpg`;
          const { error: photoErr } = await uploadInspectionMedia(photoPath, photo.blob);

          if (!photoErr) {
            const { data: signedData } = await getInspectionMediaSignedUrl(photoPath);
            photoUrls.push({
              url: signedData?.signedUrl || photoPath,
              timestamp: photo.timestamp,
            });
          }
        }

        const { data: inspection, error: inspectionErr } = await insertServiceInspection({
          user_id: user.id,
          service_id: serviceId || null,
          vehicle_id: vehicleId || null,
          template_id: null,
          template_name: "Voice Inspection Report",
          inspector_name: user.user_metadata?.full_name || user.email || "Technician",
          inspection_date: new Date().toISOString().split("T")[0],
          notes: summary || null,
          status: "completed",
          audio_url: audioUrl,
          transcript: confirmedTranscript,
          ai_structured: true,
          source: "voice",
        });

        if (inspectionErr) throw inspectionErr;
        const inspectionId = inspection.id;

        // 4. Insert inspection_results for each finding
        if (confirmedFindings.length > 0) {
          const results = confirmedFindings.map((f, idx) => {
            // Try to match a photo by closest timestamp
            const matchedPhoto = photoUrls.length > 0
              ? photoUrls.reduce((closest, p) =>
                  Math.abs(p.timestamp - idx * 10) < Math.abs(closest.timestamp - idx * 10)
                    ? p
                    : closest
                )
              : null;

            return {
              inspection_id: inspectionId,
              item_name: f.item_name,
              item_category: f.category,
              status: f.status,
              notes: f.notes || null,
              image_url: matchedPhoto?.url || null,
              sort_order: idx,
              severity: f.severity,
              measurement: f.measurement || null,
              source: "voice",
            };
          });

          const { error: resultsErr } = await insertInspectionResults(results);

          if (resultsErr) {
            console.error("Results insert error:", resultsErr);
            // Non-fatal — inspection header is saved
          }
        }

        toast.success("Voice inspection report saved!");
        setStep("done");
        onComplete?.(inspectionId);
      } catch (err) {
        console.error("Save inspection error:", err);
        toast.error("Failed to save inspection. Please try again.");
        setStep("review");
      } finally {
        setSaving(false);
      }
    },
    [audioBlob, audioMimeType, photos, user, serviceId, vehicleId, summary, onComplete]
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Mic className="h-5 w-5" />
            Voice Inspection
          </h2>
          <p className="text-sm text-muted-foreground">
            Record your findings, AI will structure the report
          </p>
        </div>
        {/* Step indicator */}
        <div className="flex items-center gap-2">
          <StepBadge label="Record" active={step === "record"} done={step !== "record"} />
          <StepBadge label="AI" active={step === "transcribing"} done={["review", "saving", "done"].includes(step)} />
          <StepBadge label="Review" active={step === "review"} done={["saving", "done"].includes(step)} />
          <StepBadge label="Save" active={step === "saving" || step === "done"} done={step === "done"} />
        </div>
      </div>

      {/* Step: Record */}
      {step === "record" && (
        <div className="space-y-4">
          <AudioRecorder onRecordingComplete={handleRecordingComplete} />

          <PhotoCapture
            recordingElapsed={recordingElapsed}
            onPhotosChange={setPhotos}
            photos={photos}
          />

          <div className="flex items-center justify-between">
            {onCancel && (
              <Button variant="outline" onClick={onCancel} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Cancel
              </Button>
            )}
            <Button
              onClick={handleTranscribe}
              disabled={!audioBlob}
              className="gap-2 ml-auto"
            >
              <Brain className="h-4 w-4" />
              Transcribe & Analyze
            </Button>
          </div>
        </div>
      )}

      {/* Step: Transcribing */}
      {step === "transcribing" && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <div className="text-center">
              <p className="font-medium">Transcribing & analyzing your recording...</p>
              <p className="text-sm text-muted-foreground mt-1">
                AI is listening to your narration and structuring findings
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Review */}
      {step === "review" && (
        <TranscriptReview
          transcript={transcript}
          findings={findings}
          summary={summary}
          onConfirm={handleSave}
          onBack={() => setStep("record")}
          isLoading={saving}
        />
      )}

      {/* Step: Saving */}
      {step === "saving" && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="font-medium">Saving inspection report...</p>
          </CardContent>
        </Card>
      )}

      {/* Step: Done */}
      {step === "done" && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-4">
            <div className="h-12 w-12 rounded-md bg-gray-100 dark:bg-green-900 flex items-center justify-center">
              <Save className="h-6 w-6 text-gray-600" />
            </div>
            <div className="text-center">
              <p className="font-medium">Inspection Report Saved!</p>
              <p className="text-sm text-muted-foreground mt-1">
                {findings.length} findings recorded
                {photos.length > 0 ? ` with ${photos.length} photos` : ""}
              </p>
            </div>
            {onCancel && (
              <Button variant="outline" onClick={onCancel}>
                Close
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Small step indicator badge */
function StepBadge({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <Badge
      variant={active ? "default" : done ? "secondary" : "outline"}
      className="text-[10px] px-2 py-0.5"
    >
      {label}
    </Badge>
  );
}

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Camera, X, Loader2, Search, ScanLine } from "lucide-react";
import { ocrVinFromImage, decodeVinNumber, type VinDecodeResult } from "@/application/commands/vin.command";
import { toast } from "@/components/ui/sonner";

interface VinScannerProps {
  onVinDecoded?: (result: VinDecodeResult) => void;
}

export function VinScanner({ onVinDecoded }: VinScannerProps) {
  const [vin, setVin] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isDecoding, setIsDecoding] = useState(false);
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [result, setResult] = useState<VinDecodeResult | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsScanning(true);
    } catch (error) {
      toast.error("Unable to access camera");
      console.error("Camera error:", error);
    }
  };

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsScanning(false);
  }, []);

  /** Capture a frame from the video and send it to the OCR edge function */
  const captureAndOcr = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    // Convert to JPEG base64 (strip the data-url prefix)
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    const base64 = dataUrl.split(",")[1];

    setIsOcrProcessing(true);
    try {
      const result = await ocrVinFromImage(base64);

      if (result?.success && result.vin) {
        setVin(result.vin);
        toast.success(`VIN detected: ${result.vin}`);
        stopCamera();
      } else {
        toast.error(result?.error || "Could not read VIN. Try again with a clearer image.");
      }
    } catch (err) {
      console.error("OCR error:", err);
      toast.error("Failed to process image. Please try again.");
    } finally {
      setIsOcrProcessing(false);
    }
  };

  const decodeVin = async (vinToDecode: string) => {
    const cleanVin = vinToDecode.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");

    if (cleanVin.length !== 17) {
      toast.error("VIN must be exactly 17 characters");
      return;
    }

    setIsDecoding(true);
    try {
      const decoded = await decodeVinNumber(cleanVin);

      setResult(decoded);
      setVin(cleanVin);
      onVinDecoded?.(decoded);
      toast.success("VIN decoded successfully");
    } catch (error) {
      console.error("VIN decode error:", error);
      toast.error("Failed to decode VIN");
    } finally {
      setIsDecoding(false);
      stopCamera();
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    decodeVin(vin);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          VIN Decoder
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Hidden canvas for frame capture */}
        <canvas ref={canvasRef} className="hidden" />

        {isScanning ? (
          <div className="relative">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full rounded-lg"
            />
            {/* VIN scan overlay */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="border-2 border-primary w-4/5 h-12 rounded" />
            </div>

            {/* Camera controls */}
            <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-3">
              <Button
                size="sm"
                onClick={captureAndOcr}
                disabled={isOcrProcessing}
                className="shadow-lg"
              >
                {isOcrProcessing ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <ScanLine className="h-4 w-4 mr-1" />
                )}
                {isOcrProcessing ? "Reading…" : "Scan VIN"}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={stopCamera}
                className="shadow-lg"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <p className="text-center text-sm text-muted-foreground mt-2">
              Position the VIN in the box and tap <strong>Scan VIN</strong>
            </p>
          </div>
        ) : (
          <Button onClick={startCamera} variant="outline" className="w-full">
            <Camera className="h-4 w-4 mr-2" />
            Scan VIN with Camera
          </Button>
        )}

        <form onSubmit={handleManualSubmit} className="flex gap-2">
          <Input
            placeholder="Enter 17-character VIN"
            value={vin}
            onChange={(e) => setVin(e.target.value.toUpperCase())}
            maxLength={17}
            className="font-mono"
          />
          <Button type="submit" disabled={isDecoding || vin.length !== 17}>
            {isDecoding ? <Loader2 className="h-4 w-4 animate-spin" /> : "Decode"}
          </Button>
        </form>

        {result && (
          <div className="bg-muted p-4 rounded-lg space-y-2">
            <h4 className="font-semibold">
              {result.year} {result.make} {result.model}
            </h4>
            {result.trim && <p className="text-sm">Trim: {result.trim}</p>}
            {result.engine && <p className="text-sm">Engine: {result.engine}</p>}
            {result.transmission && <p className="text-sm">Transmission: {result.transmission}</p>}
            {result.fuelType && <p className="text-sm">Fuel: {result.fuelType}</p>}

            {result.oilSpecs && (result.oilSpecs.oilType || result.oilSpecs.oilCapacity) && (
              <div className="mt-4 pt-4 border-t">
                <h5 className="font-medium mb-2">Oil Specifications</h5>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {result.oilSpecs.oilType && (
                    <div><span className="text-muted-foreground">Type:</span> {result.oilSpecs.oilType}</div>
                  )}
                  {result.oilSpecs.oilCapacity && (
                    <div><span className="text-muted-foreground">Capacity:</span> {result.oilSpecs.oilCapacity}</div>
                  )}
                  {result.oilSpecs.oilFilter && (
                    <div><span className="text-muted-foreground">Oil Filter:</span> {result.oilSpecs.oilFilter}</div>
                  )}
                </div>
              </div>
            )}

            {result.filters && result.filters.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <h5 className="font-medium mb-2">Recommended Filters</h5>
                <div className="grid gap-2">
                  {result.filters.map((filter, idx) => (
                    <div key={idx} className="text-sm bg-background p-2 rounded">
                      <span className="font-medium capitalize">{filter.filterType}:</span>{" "}
                      {filter.brand.toUpperCase()} {filter.partNumber}
                      {filter.crossReferences && filter.crossReferences.length > 0 && (
                        <span className="text-muted-foreground">
                          {" "}(also: {filter.crossReferences.map(x => `${x.brand} ${x.partNumber}`).join(", ")})
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

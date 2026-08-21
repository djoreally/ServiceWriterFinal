import { useCallback, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ALLOWED_ACCEPT } from "@/lib/assets/validation";

interface Props {
  onFiles: (files: File[]) => void;
  compact?: boolean;
  inputId?: string;
}

export function AssetDropzone({ onFiles, compact, inputId }: Props) {

  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length) onFiles(files);
    },
    [onFiles],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files ? Array.from(e.target.files) : [];
      if (files.length) onFiles(files);
      if (inputRef.current) inputRef.current.value = "";
    },
    [onFiles],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`rounded-lg border-2 border-dashed transition-colors ${
        dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"
      } ${compact ? "p-4" : "p-8"} text-center`}
    >
      <UploadCloud
        className={`mx-auto text-muted-foreground ${compact ? "h-6 w-6 mb-2" : "h-10 w-10 mb-3"}`}
      />
      <p className={`${compact ? "text-xs" : "text-sm"} font-medium`}>
        Drag &amp; drop files here
      </p>
      {!compact && (
        <p className="text-xs text-muted-foreground mt-1">
          Images, video, audio, PDFs and more
        </p>
      )}
      <div className="mt-3">
        <Button
          type="button"
          size={compact ? "sm" : "default"}
          variant="outline"
          onClick={() => inputRef.current?.click()}
        >
          Browse files
        </Button>
      </div>
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        multiple
        accept={ALLOWED_ACCEPT}
        className="hidden"
        onChange={handleChange}
      />

    </div>
  );
}

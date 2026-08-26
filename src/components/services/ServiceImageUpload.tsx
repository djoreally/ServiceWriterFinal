import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ProgressiveImage } from "@/components/media/ProgressiveImage";
import { Camera, Upload, X, Trash2, ImageIcon } from "lucide-react";
import { toast } from "@/components/ui/sonner";

import {
  fetchServiceImages,
  uploadServiceImage,
  deleteServiceImage,
} from "@/application/commands/service-images.command";
import type { ServiceImage } from "@/application/commands/service-images.command";

interface ServiceImageUploadProps {
  serviceId: string;
}

const IMAGE_TYPES = [
  { value: "general", label: "General" },
  { value: "before", label: "Before Service" },
  { value: "after", label: "After Service" },
  { value: "parts", label: "Parts" },
  { value: "damage", label: "Damage" },
];

export function ServiceImageUpload({ serviceId }: ServiceImageUploadProps) {
  const [images, setImages] = useState<ServiceImage[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [caption, setCaption] = useState("");
  const [imageType, setImageType] = useState("general");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const loadImages = useCallback(async () => {
    const result = await fetchServiceImages(serviceId);
    setImages(result.images);
    setUserId(result.userId);
    setLoading(false);
  }, [serviceId]);

  useEffect(() => { loadImages(); }, [loadImages]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please select an image file"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be less than 5MB"); return; }
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onloadend = () => { setPreviewUrl(reader.result as string); };
    reader.readAsDataURL(file);
  }, []);

  const handleUpload = async () => {
    if (!selectedFile) { toast.error("Please select an image"); return; }
    if (!userId) { toast.error("Not authenticated"); return; }
    setUploading(true);
    try {
      await uploadServiceImage({
        userId,
        serviceId,
        file: selectedFile,
        caption: caption || null,
        imageType,
        sortOrder: images.length,
      });
      toast.success("Image uploaded successfully");
      setShowUpload(false);
      setSelectedFile(null);
      setPreviewUrl(null);
      setCaption("");
      setImageType("general");
      loadImages();
    } catch (error: unknown) {
      console.error("Upload error:", error);
      toast.error("Failed to upload image");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (imageId: string, imageUrl: string) => {
    if (!confirm("Delete this image?")) return;
    try {
      await deleteServiceImage(imageId, imageUrl);
      toast.success("Image deleted");
      loadImages();
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Failed to delete image");
    }
  };

  const groupedImages = images.reduce((acc, img) => {
    if (!acc[img.image_type]) acc[img.image_type] = [];
    acc[img.image_type].push(img);
    return acc;
  }, {} as Record<string, ServiceImage[]>);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 py-2 sm:grid-cols-3 md:grid-cols-4" aria-busy="true" aria-label="Loading service images">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <Camera className="h-5 w-5" />
          Service Images ({images.length})
        </h3>
        <Dialog open={showUpload} onOpenChange={setShowUpload}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Upload className="h-4 w-4" />
              Add Image
            </Button>
          </DialogTrigger>
          <DialogContent aria-describedby="upload-image-description">
            <DialogHeader>
              <DialogTitle>Upload Service Image</DialogTitle>
              <p id="upload-image-description" className="text-sm text-muted-foreground">Select an image and add a caption for this service.</p>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Image</Label>
                <div className="border-2 border-dashed rounded-lg p-4">
                  {previewUrl ? (
                    <div className="relative">
                      <ProgressiveImage src={previewUrl} alt="Preview" className="max-h-48 mx-auto rounded object-contain" placeholderClassName="h-48 w-full rounded" />
                      <Button
                        size="icon"
                        variant="destructive"
                        className="absolute top-2 right-2 h-6 w-6"
                        onClick={() => { setPreviewUrl(null); setSelectedFile(null); }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center gap-2 cursor-pointer py-4">
                      <ImageIcon className="h-10 w-10 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Click to select image</span>
                      <Input type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
                    </label>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Image Type</Label>
                <Select value={imageType} onValueChange={setImageType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {IMAGE_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Caption (optional)</Label>
                <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Describe the image..." />
              </div>
              <Button onClick={handleUpload} disabled={uploading || !selectedFile} className="w-full">
                {uploading ? "Uploading..." : "Upload Image"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {images.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No images uploaded yet</p>
            <p className="text-sm">Add photos of the service, parts, or vehicle condition</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedImages).map(([type, imgs]) => (
            <div key={type}>
              <h4 className="text-sm font-medium text-muted-foreground mb-2 capitalize">
                {IMAGE_TYPES.find((t) => t.value === type)?.label || type}
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {imgs.map((img) => (
                  <div key={img.id} className="relative group">
                    <ProgressiveImage
                      src={img.image_url}
                      alt={img.caption || "Service image"}
                      className="h-24 rounded-lg border"
                      placeholderClassName="rounded-lg"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                      <Button
                        size="icon"
                        variant="destructive"
                        className="h-8 w-8"
                        onClick={() => handleDelete(img.id, img.image_url)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {img.caption && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">{img.caption}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

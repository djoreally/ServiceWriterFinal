import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Building2, Upload, Loader2 } from "lucide-react";
import { uploadBusinessLogo } from "@/application/commands/logo-upload.command";
import { toast } from "@/components/ui/sonner";

interface BusinessInfoData {
  business_name: string;
  owner_name: string;
  email: string;
  phone: string;
  logo_url: string | null;
}

interface BusinessInfoStepProps {
  data: BusinessInfoData;
  onUpdate: (data: Partial<BusinessInfoData>) => void;
  onNext: () => void;
}

export const BusinessInfoStep = ({ data, onUpdate, onNext }: BusinessInfoStepProps) => {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error("File size must be less than 2MB");
      return;
    }

    setUploading(true);
    try {
      const publicUrl = await uploadBusinessLogo(file);
      onUpdate({ logo_url: publicUrl });
      toast.success("Logo uploaded successfully");
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload logo");
    } finally {
      setUploading(false);
    }
  };

  const isValid = data.business_name.trim().length > 0;

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="text-center pb-2">
        <div className="mx-auto w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center mb-4">
          <Building2 className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-2xl">Let's set up your business</CardTitle>
        <CardDescription className="text-base">
          Tell us a bit about your business so customers know who you are
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 max-w-md mx-auto">
        {/* Logo upload */}
        <div className="flex flex-col items-center gap-4">
          <Avatar className="h-24 w-24">
            <AvatarImage src={data.logo_url || undefined} />
            <AvatarFallback className="bg-muted text-2xl">
              {data.business_name?.[0]?.toUpperCase() || "B"}
            </AvatarFallback>
          </Avatar>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleLogoUpload}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Upload Logo
          </Button>
        </div>

        {/* Form fields */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="business_name">
              Business Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="business_name"
              value={data.business_name}
              onChange={(e) => onUpdate({ business_name: e.target.value })}
              placeholder="Your Business Name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="owner_name">Your Name</Label>
            <Input
              id="owner_name"
              value={data.owner_name}
              onChange={(e) => onUpdate({ owner_name: e.target.value })}
              placeholder="John Smith"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={data.email}
                onChange={(e) => onUpdate({ email: e.target.value })}
                placeholder="contact@business.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={data.phone}
                onChange={(e) => onUpdate({ phone: e.target.value })}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>
        </div>

        <Button
          onClick={onNext}
          className="w-full"
          size="lg"
          disabled={!isValid}
        >
          Continue
        </Button>
      </CardContent>
    </Card>
  );
};

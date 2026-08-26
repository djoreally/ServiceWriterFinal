/**
 * BusinessProfileSection - Business profile and logo settings
 */

import { Building, Upload, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { uploadBusinessLogo } from "@/application/commands/logo-upload.command";
import { toast } from "@/components/ui/sonner";
import { useState } from "react";

interface BusinessProfileData {
  business_name: string;
  owner_name: string;
  phone: string;
  email: string;
  address: string;
  logo_url: string;
}

interface BusinessProfileSectionProps {
  profile: BusinessProfileData;
  onProfileChange: (updates: Partial<BusinessProfileData>) => void;
}

export function BusinessProfileSection({ profile, onProfileChange }: BusinessProfileSectionProps) {
  const [uploading, setUploading] = useState(false);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const publicUrl = await uploadBusinessLogo(file);
      onProfileChange({ logo_url: publicUrl });
      toast.success("Logo uploaded successfully");
    } catch {
      toast.error("Failed to upload logo");
    }
    setUploading(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building className="h-5 w-5" />
          Business Profile
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Logo Upload */}
        <div className="flex items-center gap-6">
          <Avatar className="h-24 w-24">
            <AvatarImage src={profile.logo_url} alt="Business logo" />
            <AvatarFallback className="text-2xl bg-primary/10 text-primary">
              {profile.business_name?.charAt(0) || "B"}
            </AvatarFallback>
          </Avatar>
          <div>
            <Label htmlFor="logo-upload" className="cursor-pointer">
              <div className="flex items-center gap-2 px-4 py-2 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors">
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Upload Logo
              </div>
              <Input
                id="logo-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoUpload}
                disabled={uploading}
              />
            </Label>
            <p className="text-xs text-muted-foreground mt-2">
              PNG, JPG up to 2MB
            </p>
          </div>
        </div>

        {/* Business Information */}
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="business_name">Business Name</Label>
            <Input
              id="business_name"
              placeholder="Your Auto Shop Name"
              value={profile.business_name}
              onChange={(e) => onProfileChange({ business_name: e.target.value })}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="owner_name">Owner Name</Label>
            <Input
              id="owner_name"
              placeholder="John Smith"
              value={profile.owner_name}
              onChange={(e) => onProfileChange({ owner_name: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="shop@example.com"
                value={profile.email}
                onChange={(e) => onProfileChange({ email: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="(555) 123-4567"
                value={profile.phone}
                onChange={(e) => onProfileChange({ phone: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              placeholder="123 Main Street, City, State 12345"
              value={profile.address}
              onChange={(e) => onProfileChange({ address: e.target.value })}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

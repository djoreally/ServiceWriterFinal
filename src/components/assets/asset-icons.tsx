import {
  FileText,
  Image as ImageIcon,
  Music,
  Video,
  FileArchive,
  File as FileIcon,
  type LucideIcon,
} from "lucide-react";
import type { AssetType } from "@/lib/assets/validation";

export function getAssetIcon(asset: {
  asset_type: AssetType;
  mime_type: string;
}): LucideIcon {
  switch (asset.asset_type) {
    case "image":
      return ImageIcon;
    case "video":
      return Video;
    case "audio":
      return Music;
    case "document":
      if (asset.mime_type.includes("zip")) return FileArchive;
      return FileText;
    default:
      return FileIcon;
  }
}

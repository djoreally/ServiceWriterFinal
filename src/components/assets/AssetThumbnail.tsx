import { useEffect, useState } from "react";
import { getAssetSignedUrl } from "@/application/queries/assets.query";
import type { AssetRecord } from "@/application/commands/assets.command";
import { getAssetIcon } from "./asset-icons";

interface Props {
  asset: AssetRecord;
  className?: string;
}

export function AssetThumbnail({ asset, className }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (asset.asset_type !== "image") return;
    getAssetSignedUrl(asset.storage_path, 3600)
      .then((u) => {
        if (!cancelled) setUrl(u);
      })
      .catch(() => {
        if (!cancelled) setErrored(true);
      });
    return () => {
      cancelled = true;
    };
  }, [asset.id, asset.storage_path, asset.asset_type]);

  if (asset.asset_type === "image" && url && !errored) {
    return (
      <img
        src={url}
        alt={asset.original_filename}
        loading="lazy"
        onError={() => setErrored(true)}
        className={
          className ??
          "h-full w-full object-cover bg-muted"
        }
      />
    );
  }

  const Icon = getAssetIcon(asset);
  return (
    <div
      className={
        className ??
        "h-full w-full flex items-center justify-center bg-muted text-muted-foreground"
      }
    >
      <Icon className="h-10 w-10" />
    </div>
  );
}

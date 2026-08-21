import { ImgHTMLAttributes, useState } from "react";
import { cn } from "@/lib/utils";

type ProgressiveImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  placeholderClassName?: string;
};

export const ProgressiveImage = ({ className, placeholderClassName, onLoad, ...props }: ProgressiveImageProps) => {
  const [loaded, setLoaded] = useState(false);

  return (
    <span className={cn("relative block overflow-hidden bg-muted", placeholderClassName)}>
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-0 scale-110 bg-gradient-to-br from-muted via-muted/70 to-muted animate-pulse transition-opacity duration-500",
          loaded && "opacity-0",
        )}
      />
      <img
        className={cn(
          "relative h-full w-full object-cover transition duration-700 ease-out",
          loaded ? "scale-100 blur-0 opacity-100" : "scale-105 blur-xl opacity-70",
          className,
        )}
        loading="lazy"
        decoding="async"
        onLoad={(event) => {
          setLoaded(true);
          onLoad?.(event);
        }}
        {...props}
      />
    </span>
  );
};


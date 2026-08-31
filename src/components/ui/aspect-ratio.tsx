import * as AspectRatioPrimitive from "@radix-ui/react-aspect-ratio";

const AspectRatio = (props: React.ComponentProps<typeof AspectRatioPrimitive.Root>) => <AspectRatioPrimitive.Root {...props} />;
AspectRatio.displayName = AspectRatioPrimitive.Root.displayName;

export { AspectRatio };

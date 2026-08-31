import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";

const Collapsible = (props: React.ComponentProps<typeof CollapsiblePrimitive.Root>) => <CollapsiblePrimitive.Root {...props} />;
Collapsible.displayName = CollapsiblePrimitive.Root.displayName;

const CollapsibleTrigger = (props: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>) => <CollapsiblePrimitive.CollapsibleTrigger {...props} />;
CollapsibleTrigger.displayName = CollapsiblePrimitive.CollapsibleTrigger.displayName;

const CollapsibleContent = (props: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>) => <CollapsiblePrimitive.CollapsibleContent {...props} />;
CollapsibleContent.displayName = CollapsiblePrimitive.CollapsibleContent.displayName;

export { Collapsible, CollapsibleTrigger, CollapsibleContent };

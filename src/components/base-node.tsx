import { forwardRef, HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export const BaseNode = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & { selected?: boolean }
>(({ className, selected, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "relative rounded-sm border bg-card p-5 text-card-foreground",
      className,
      selected ? "border-gray-400 shadow-lg" : "",
    )}
    {...props}
  />
));

BaseNode.displayName = "BaseNode";

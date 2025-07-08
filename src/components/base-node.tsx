import { forwardRef, HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const BaseNode = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & {
    selected?: boolean;
    progress?: number;
    status?: string;
  }
>(({ className, selected, progress, status, children, ...props }, ref) => {
  const showProgress = progress && progress > 0 && progress < 100;

  return (
    <div
      ref={ref}
      className={cn(
        "relative rounded-sm border bg-card p-5 text-card-foreground shadow-sm",
        className,
        selected ? "border-gray-400 shadow-lg" : ""
      )}
      {...props}
    >
      {children}

      {showProgress && (
        <div className="absolute bottom-0 left-0 w-full h-5 bg-gray-400 rounded-b-sm overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all duration-150"
            style={{ width: `${progress}%` }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-white text-xs font-semibold pointer-events-none">{status}</span>
          </div>
        </div>
      )}
    </div>
  );
});

BaseNode.displayName = "BaseNode";

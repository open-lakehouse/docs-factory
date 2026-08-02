import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        data-slot="textarea"
        className={cn(
          "flex field-sizing-content min-h-16 w-full rounded-[4px] border border-border bg-secondary/45 px-2.5 py-2 text-sm text-foreground transition-[background-color,border-color] duration-100 outline-none placeholder:text-muted-foreground hover:border-foreground/20 focus-visible:border-primary focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-45 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20",
          className,
        )}
        {...props}
      />
    );
  },
);

export { Textarea };

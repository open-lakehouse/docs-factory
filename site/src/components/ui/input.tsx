import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  function Input({ className, type, ...props }, ref) {
    return (
      <input
        ref={ref}
        type={type}
        data-slot="input"
        className={cn(
          "flex h-8 w-full min-w-0 rounded-[4px] border border-border bg-secondary/45 px-2.5 py-1 text-sm text-foreground transition-[background-color,border-color] duration-100 outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs file:font-medium file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 hover:border-foreground/20 focus-visible:border-primary focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-primary/20 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20",
          className
        )}
        {...props}
      />
    )
  }
)

export { Input }

import * as React from "react"

import { cn } from "@/lib/utils"

function Switch({
  className,
  checked,
  onCheckedChange,
  ...props
}: Omit<React.ComponentProps<"button">, "onChange" | "role"> & {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-state={checked ? "checked" : "unchecked"}
      data-slot="switch"
      className={cn(
        "peer inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-[background-color,border-color] outline-none focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-45 data-[state=checked]:bg-primary/55 data-[state=unchecked]:bg-muted-foreground/25",
        className
      )}
      onClick={() => onCheckedChange(!checked)}
      {...props}
    >
      <span
        aria-hidden
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block size-3 rounded-full bg-background shadow-sm transition-transform",
          checked ? "translate-x-3.5" : "translate-x-0.5",
        )}
      />
    </button>
  )
}

export { Switch }

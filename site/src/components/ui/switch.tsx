import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

// shadcn/new-york Switch on the Radix primitive (matching the other ui/
// primitives, which import from the unified `radix-ui` package). Radix supplies
// the role/aria-checked/data-state wiring, keyboard (Space/Enter) handling, and
// form integration (name/value); the classes preserve this repo's retuned
// sizing + color tokens rather than stock shadcn dimensions.
function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-[background-color,border-color] outline-none focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-45 data-[state=checked]:bg-primary/55 data-[state=unchecked]:bg-muted-foreground/25",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block size-3 translate-x-0.5 rounded-full bg-background shadow-sm transition-transform data-[state=checked]:translate-x-3.5"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }

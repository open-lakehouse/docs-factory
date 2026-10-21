import * as React from "react";

import { cn } from "@/lib/utils";

// Insert the text the paste event carries rather than letting the browser
// re-read the system pasteboard for the default insertion. Paste-to-insert
// dictation tools (Wispr Flow) restore the previous clipboard right after
// sending ⌘V, and Chrome's default insertion can lose that race: `paste` sees
// the transcript, `beforeinput` sees nothing, and no text lands.
function insertPastedText(e: React.ClipboardEvent<HTMLTextAreaElement>) {
  const text = e.clipboardData.getData("text/plain");
  if (!text) return;
  e.preventDefault();
  // execCommand keeps native undo and fires `input`, so React's onChange runs.
  if (document.execCommand("insertText", false, text)) return;
  const el = e.currentTarget;
  el.setRangeText(text, el.selectionStart, el.selectionEnd, "end");
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  function Textarea({ className, onPaste, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        data-slot="textarea"
        className={cn(
          "flex field-sizing-content min-h-16 w-full rounded-[4px] border border-border bg-secondary/45 px-2.5 py-2 text-sm text-foreground transition-[background-color,border-color] duration-100 outline-none placeholder:text-muted-foreground hover:border-foreground/20 focus-visible:border-primary focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-45 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20",
          className,
        )}
        onPaste={(e) => {
          onPaste?.(e);
          if (!e.defaultPrevented) insertPastedText(e);
        }}
        {...props}
      />
    );
  },
);

export { Textarea };

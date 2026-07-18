import { useState, type ReactNode } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Frame that renders its child diagram inline and can expand it to a
 * near-fullscreen dialog. `children` is a render prop receiving `expanded`.
 */
export default function ExpandableDiagram({
  children,
  inlineClassName = "diagram-frame",
}: {
  children: (expanded: boolean) => ReactNode;
  /** Class for the inline frame. Pass a fit variant to let it grow to the
   * diagram's natural height (e.g. tall sequences) instead of a fixed height. */
  inlineClassName?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div className={inlineClassName}>
        <button
          type="button"
          className="diagram-expand-btn"
          onClick={() => setExpanded(true)}
          aria-label="Expand diagram"
        >
          <Maximize2 size={15} aria-hidden="true" />
          <span>Expand</span>
        </button>
        {children(false)}
      </div>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="diagram-frame-expanded" showCloseButton>
          <DialogTitle className="sr-only">Expanded diagram</DialogTitle>
          <button
            type="button"
            className="diagram-expand-btn"
            onClick={() => setExpanded(false)}
            aria-label="Collapse diagram"
          >
            <Minimize2 size={15} aria-hidden="true" />
            <span>Close</span>
          </button>
          {children(true)}
        </DialogContent>
      </Dialog>
    </>
  );
}

// Shares the right pane's portal target with the active tab. The active
// ReviewTab renders its comment view into this element via createPortal — from
// INSIDE its own ReviewProvider — so the right-hand comments follow the active
// tab without lifting any per-tab review state up to the shell.
//
// The element is held in state (not a bare ref) so consumers re-render once the
// slot node mounts and the portal target becomes available.
import { createContext, useContext } from "react";

export const RightPaneSlotContext = createContext<HTMLElement | null>(null);

export function useRightPaneSlot(): HTMLElement | null {
  return useContext(RightPaneSlotContext);
}

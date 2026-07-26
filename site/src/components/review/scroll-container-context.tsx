// Which element scrolls the rendered article. Defaults to the window. Docs
// pages scroll inside `.docs-main-scroll`; editor workspace tabs scroll inside
// their middle pane. ReviewTab / DocPage provide the element here so ThreadCard
// jumps and deep-links scroll the right container, not a non-scrolling window.
import { createContext, useContext } from "react";
import type { ScrollContainer } from "../../lib/scroll-to-context";

// `null` is the "use window" sentinel: the provider may pass its pane element
// once it mounts (a ref settles to null on first render), and consumers fall
// back to window until then — matching routes that still scroll the document.
const ScrollContainerContext = createContext<ScrollContainer | null>(null);

export function ScrollContainerProvider({
  container,
  children,
}: {
  container: ScrollContainer | null;
  children: React.ReactNode;
}) {
  return (
    <ScrollContainerContext.Provider value={container}>{children}</ScrollContainerContext.Provider>
  );
}

/** The active scroll container, defaulting to `window` when none is provided. */
export function useScrollContainer(): ScrollContainer {
  return useContext(ScrollContainerContext) ?? window;
}

// Which element scrolls the rendered article. On the single-page /docs and
// /blog routes the article scrolls with the window (the default). In the editor
// workspace each tab's article scrolls inside its own middle pane, so a review
// jump (thread-card click, deep-link intent) must scroll THAT pane, not the
// window. ReviewTab provides its pane element here; ThreadCard and the deep-link
// hook read it. Portals preserve context, so the comment rail portaled into the
// right pane still reads the active tab's scroll container.
import { createContext, useContext } from "react";
import type { ScrollContainer } from "../../lib/scroll-to-context";

// `null` is the "use window" sentinel: the provider may pass its pane element
// once it mounts (a ref settles to null on first render), and consumers fall
// back to window until then — matching the single-page-route behavior.
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

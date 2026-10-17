// A hover card for content inside a diagram node. The card portals where the
// diagram says: the body inline, but inside the expand dialog, a modal that
// draws above anything in the body.
import { useDiagramPortal } from "@open-lakehouse/trestle-diagram";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

const OPEN_DELAY_MS = 120;
// Long enough to cross the gap between trigger and card.
const CLOSE_DELAY_MS = 150;
const EDGE_GAP = 8;

/**
 * `interactive` keeps the card open while the pointer is on it, so links in it
 * can be clicked; otherwise it ignores the pointer.
 */
export function useHoverCard({ interactive = false }: { interactive?: boolean } = {}) {
  const portal = useDiagramPortal();
  const cardId = useId();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [at, setAt] = useState<DOMRect | null>(null);
  const card = useRef<HTMLDivElement>(null);

  // Nodes on the right edge would push the card off-screen: pull it back in.
  useLayoutEffect(() => {
    const el = card.current;
    if (!at || !el) return;
    const max = window.innerWidth - el.offsetWidth - EDGE_GAP;
    el.style.left = `${Math.max(EDGE_GAP, Math.min(at.left, max))}px`;
  }, [at]);

  const show = useCallback((el: HTMLElement, delay: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setAt(el.getBoundingClientRect()), delay);
  }, []);
  const hide = useCallback((delay = 0) => {
    clearTimeout(timer.current);
    if (delay) timer.current = setTimeout(() => setAt(null), delay);
    else setAt(null);
  }, []);
  const keep = useCallback(() => clearTimeout(timer.current), []);

  const trigger = {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => show(e.currentTarget, OPEN_DELAY_MS),
    onMouseLeave: () => hide(interactive ? CLOSE_DELAY_MS : 0),
    onFocus: (e: React.FocusEvent<HTMLElement>) => show(e.currentTarget, 0),
    onBlur: () => hide(),
    onKeyDown: (e: React.KeyboardEvent) => e.key === "Escape" && hide(),
    "aria-describedby": at ? cardId : undefined,
  };

  const popover = (className: string, children: ReactNode) => {
    if (!at) return null;
    const style: CSSProperties = { left: at.left, top: at.bottom + 6 };
    if (interactive) style.pointerEvents = "auto";
    return createPortal(
      <div
        ref={card}
        id={cardId}
        role="tooltip"
        className={className}
        style={style}
        {...(interactive ? { onMouseEnter: keep, onMouseLeave: () => hide(CLOSE_DELAY_MS) } : {})}
      >
        {children}
      </div>,
      portal ?? document.body,
    );
  };

  return { trigger, popover };
}

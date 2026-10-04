import { useEffect, useState } from "react";
import type { Heading } from "../../site";

/** The id of the last heading scrolled up under the topbar, tracked client-side only. */
function useActiveHeading(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  // A string key, so a fresh array of the same ids doesn't re-subscribe every render.
  const key = ids.join("\n");
  useEffect(() => {
    const list = key ? key.split("\n") : [];
    if (list.length === 0) return;
    // Where an anchor jump lands a heading (scroll-padding-top), plus slack for rounding,
    // so the heading a TOC link jumps to is the one that lights up.
    const root = document.documentElement;
    const threshold = (Number.parseFloat(getComputedStyle(root).scrollPaddingTop) || 0) + 8;

    const compute = () => {
      // Looked up per pass: after a client navigation the page's content mounts later.
      const els = list.map((id) => document.getElementById(id)).filter((el) => el !== null);
      let current: string | null = null;
      for (const el of els) {
        if (el.getBoundingClientRect().top > threshold) break;
        current = el.id;
      }
      // Trailing sections shorter than the viewport can never reach the threshold.
      const atBottom = window.innerHeight + window.scrollY >= root.scrollHeight - 2;
      if (atBottom && current !== null) current = els[els.length - 1].id;
      setActive(current);
    };

    let frame = 0;
    const schedule = () => {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          compute();
        });
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    // Content loading, tabs, and expanding code blocks move headings without scrolling.
    const resize = new ResizeObserver(schedule);
    resize.observe(document.body);
    compute();
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      resize.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [key]);
  return active;
}

export default function OnThisPage({ headings }: { headings: Heading[] }) {
  const items = headings.filter((h) => h.level === 2 || h.level === 3);
  const active = useActiveHeading(items.map((h) => h.id));
  if (items.length === 0) return null;
  return (
    <nav className="toc" aria-label="On this page">
      <p className="toc-title">on this page</p>
      <ul>
        {items.map((h) => (
          <li key={h.id} data-level={h.level}>
            <a href={`#${h.id}`} aria-current={h.id === active ? "location" : undefined}>
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

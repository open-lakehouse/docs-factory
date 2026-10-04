import { useEffect, useState } from "react";
import type { Heading } from "../../site";

/** The id of the last heading scrolled past the top band, tracked client-side only. */
function useActiveHeading(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  // A string key, so a fresh array of the same ids doesn't re-subscribe every render.
  const key = ids.join("\n");
  useEffect(() => {
    const els = key
      .split("\n")
      .map((id) => document.getElementById(id))
      .filter((el) => el !== null);
    if (els.length === 0) return;
    const visible = new Set<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target);
          else visible.delete(e.target);
        }
        // Topmost heading inside the band wins; with none in view, keep the last one.
        const first = els.find((el) => visible.has(el));
        if (first) setActive(first.id);
      },
      // A band across the top third: a heading activates once it scrolls up under the topbar.
      { rootMargin: "-64px 0px -66% 0px" },
    );
    for (const el of els) observer.observe(el);
    return () => observer.disconnect();
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

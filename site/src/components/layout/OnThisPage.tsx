import { useEffect, useState, type RefObject } from "react";
import { useScrollContainer } from "../review/scroll-container-context";

export interface TocHeading {
  id: string;
  text: string;
  level: 2 | 3;
}

interface OnThisPageProps {
  articleRef: RefObject<HTMLElement | null>;
}

export default function OnThisPage({ articleRef }: OnThisPageProps) {
  const [headings, setHeadings] = useState<TocHeading[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const scrollContainer = useScrollContainer();

  useEffect(() => {
    const article = articleRef.current;
    if (!article) return;

    const nodes = article.querySelectorAll("h2, h3");
    const found: TocHeading[] = [];
    nodes.forEach((node) => {
      const id = node.id;
      if (!id) return;
      const level = node.tagName === "H2" ? 2 : 3;
      found.push({ id, text: node.textContent ?? "", level });
    });
    setHeadings(found);
    setActiveId(found[0]?.id ?? "");
  }, [articleRef]);

  useEffect(() => {
    if (headings.length === 0) return;
    const article = articleRef.current;
    if (!article) return;

    const root = scrollContainer instanceof HTMLElement ? scrollContainer : null;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0 && visible[0].target.id) {
          setActiveId(visible[0].target.id);
        }
      },
      { root, rootMargin: "-80px 0px -70% 0px", threshold: 0 },
    );

    for (const { id } of headings) {
      const el = article.querySelector(`#${CSS.escape(id)}`);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [headings, articleRef, scrollContainer]);

  if (headings.length === 0) return null;

  function jumpToHeading(id: string) {
    const article = articleRef.current;
    const el = article?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (!el) return;
    if (scrollContainer instanceof HTMLElement) {
      const view = scrollContainer.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      const top = scrollContainer.scrollTop + (rect.top - view.top) - 16;
      scrollContainer.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    } else {
      el.scrollIntoView({ behavior: "smooth" });
    }
    setActiveId(id);
  }

  return (
    <aside className="toc" aria-label="On this page">
      <p className="toc-title">On this page</p>
      <ul className="toc-list">
        {headings.map((h) => (
          <li key={h.id} className={h.level === 3 ? "toc-item toc-item-nested" : "toc-item"}>
            <a
              href={`#${h.id}`}
              className={activeId === h.id ? "toc-link active" : "toc-link"}
              onClick={(e) => {
                e.preventDefault();
                jumpToHeading(h.id);
              }}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}

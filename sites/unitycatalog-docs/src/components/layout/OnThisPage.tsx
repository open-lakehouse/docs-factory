import type { Heading } from "../../site";

export default function OnThisPage({ headings }: { headings: Heading[] }) {
  const items = headings.filter((h) => h.level === 2 || h.level === 3);
  if (items.length === 0) return null;
  return (
    <nav className="toc" aria-label="On this page">
      <p className="toc-title">On this page</p>
      <ul>
        {items.map((h) => (
          <li key={h.id} data-level={h.level}>
            <a href={`#${h.id}`}>{h.text}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

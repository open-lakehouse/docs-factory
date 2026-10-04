// Page-worthy estate concepts that no content page `explains:` yet — the
// explanation backlog, grouped by model kind.
import { explainEntries, kindLabel } from "../../explain";
import { hasExplanationPage } from "../../explain-bindings";

export default function CoverageGaps() {
  const gaps = explainEntries.filter((e) => !hasExplanationPage(e.id));
  const kinds = [...new Set(gaps.map((e) => e.kind))];

  return (
    <section aria-label="Coverage gaps">
      <h1>Coverage gaps</h1>
      <p className="muted">
        Concepts in the Open Lakehouse reference model with no explanation page yet.
      </p>
      {gaps.length === 0 ? (
        <p className="review-empty">Every concept has an explanation page.</p>
      ) : (
        kinds.map((kind) => (
          <div key={kind} className="mt-6">
            <h2 className="blog-aside-title">{kindLabel(kind)}</h2>
            <ul className="draft-list compact">
              {gaps
                .filter((e) => e.kind === kind)
                .map((e) => (
                  <li key={e.id}>
                    {e.title} <code className="muted">{e.id}</code>
                    {e.summary && <p className="muted">{e.summary}</p>}
                  </li>
                ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

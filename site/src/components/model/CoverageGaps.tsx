// Page-worthy estate concepts that no content page `explains:` yet — the
// explanation backlog, grouped by model kind. A concept someone already asked
// for (an open request whose body names it) is marked instead of re-offered.
// Each row says how much the docs already lean on the concept, so the gaps the
// most pages cite stand out.
import { Link } from "react-router-dom";
import { explainEntries, kindLabel } from "../../explain";
import { hasExplanationPage } from "../../explain-bindings";
import { useAuth } from "../../lib/auth-context";
import { modelHref } from "../../lib/content-ref";
import { type ElementIndex, useModelIndex } from "../../lib/model-index";
import {
  explainsLine,
  RequestExplanationButton,
  requestStatusLabel,
  useOpenContentRequests,
} from "../review/ContentRequests";

function citations(entry: ElementIndex | undefined): number {
  if (!entry) return 0;
  const pages = [...entry.referencedBy, ...entry.linkedFrom].map(
    (p) => `${p.area}/${p.project ?? ""}/${p.slug}`,
  );
  return new Set(pages).size;
}

function Context({ entry }: { entry: ElementIndex | undefined }) {
  if (!entry) return null;
  const cited = citations(entry);
  const parts = [
    cited > 0 && `cited by ${cited} ${cited === 1 ? "page" : "pages"}`,
    entry.journeys.length > 0 && `${entry.journeys.length} journeys`,
    entry.environments.length > 0 && `runs in ${entry.environments.length} environments`,
    !entry.public && "not #public",
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return <p className="muted text-xs">{parts.join(" · ")}</p>;
}

export default function CoverageGaps() {
  const { isAllowlisted } = useAuth();
  const requests = useOpenContentRequests();
  const { index } = useModelIndex();
  const gaps = explainEntries
    .filter((e) => !hasExplanationPage(e.id))
    .sort((a, b) => citations(index?.elements[b.id]) - citations(index?.elements[a.id]));
  const kinds = [...new Set(explainEntries.map((e) => e.kind))].filter((k) =>
    gaps.some((e) => e.kind === k),
  );
  const requestFor = (id: string) =>
    requests.find((r) => r.bodyMd.split("\n").some((line) => line.trim() === explainsLine(id)));

  if (gaps.length === 0) {
    return <p className="review-empty">Every concept has an explanation page.</p>;
  }
  return (
    <>
      <p className="muted text-sm">
        {gaps.length} of {explainEntries.length} concepts have no explanation page. Most-cited
        first.
      </p>
      {kinds.map((kind) => {
        const ofKind = gaps.filter((e) => e.kind === kind);
        return (
          <div key={kind} className="mt-6">
            <h2 className="blog-aside-title">
              {kindLabel(kind)} <span className="plan-chip-count">{ofKind.length}</span>
            </h2>
            <ul className="draft-list compact">
              {ofKind.map((e) => {
                const asked = requestFor(e.id);
                return (
                  <li key={e.id} className="coverage-gap">
                    <div>
                      <Link to={modelHref({ kind: "element", id: e.id })}>{e.title}</Link>{" "}
                      <code className="muted">{e.id}</code>
                      {e.summary && <p className="muted">{e.summary}</p>}
                      <Context entry={index?.elements[e.id]} />
                    </div>
                    {asked ? (
                      <span className="muted text-xs">
                        {requestStatusLabel(asked.status)} by {asked.requestedByLogin}
                      </span>
                    ) : (
                      isAllowlisted && <RequestExplanationButton id={e.id} title={e.title} />
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </>
  );
}

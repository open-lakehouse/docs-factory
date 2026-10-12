// Page-worthy estate concepts that no content page `explains:` yet — the
// explanation backlog, grouped by model kind. A concept someone already asked
// for (an open request whose body names it) is marked instead of re-offered.
import { explainEntries, kindLabel } from "../../explain";
import { hasExplanationPage } from "../../explain-bindings";
import { useAuth } from "../../lib/auth-context";
import {
  explainsLine,
  RequestExplanationButton,
  requestStatusLabel,
  useOpenContentRequests,
} from "../review/ContentRequests";

export default function CoverageGaps() {
  const { isAllowlisted } = useAuth();
  const requests = useOpenContentRequests();
  const gaps = explainEntries.filter((e) => !hasExplanationPage(e.id));
  const kinds = [...new Set(gaps.map((e) => e.kind))];
  const requestFor = (id: string) =>
    requests.find((r) => r.bodyMd.split("\n").some((line) => line.trim() === explainsLine(id)));

  if (gaps.length === 0) {
    return <p className="review-empty">Every concept has an explanation page.</p>;
  }
  return (
    <>
      <p className="muted text-sm">
        {gaps.length} of {explainEntries.length} concepts have no explanation page.
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
                      {e.title} <code className="muted">{e.id}</code>
                      {e.summary && <p className="muted">{e.summary}</p>}
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

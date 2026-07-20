import { Link } from "react-router-dom";
import Shell from "../components/layout/Shell";
import SemanticChip from "../components/SemanticChip";
import { conceptGroups, type ConceptNode } from "../graph";

const groups = conceptGroups();

function pageCountLabel(n: number): string {
  return `${n} ${n === 1 ? "page" : "pages"}`;
}

function ConceptSection({
  title,
  blurb,
  nodes,
}: {
  title: string;
  blurb: string;
  nodes: ConceptNode[];
}) {
  if (nodes.length === 0) return null;
  return (
    <section className="nav-section">
      <h2>{title}</h2>
      <p className="muted">{blurb}</p>
      <div className="concept-grid">
        {nodes.map((node) => (
          <Link key={node.id} to={node.href} className="concept-card">
            <div className="concept-card-head">
              <span className="concept-card-title">{node.title}</span>
              <span className="muted concept-card-count">
                {pageCountLabel(node.pageCount)}
              </span>
            </div>
            {node.summary && (
              <p className="muted concept-card-summary">{node.summary}</p>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}

/**
 * Concept-first entry into the knowledge graph: browse the estate model's nodes
 * (capabilities, specifications, engines, other implementations) and jump to any
 * node's `/explain/:id` page, which lists its content grouped by Diátaxis. The
 * co-equal intent-first entry is /docs.
 */
export default function ConceptIndex() {
  return (
    <Shell wide>
      <h1>Concepts</h1>
      <p className="muted">
        Browse the Open Lakehouse by concept — the capabilities, open
        specifications, and engines that make up the estate. Pick a concept to see
        how to learn it, do it, look it up, and understand it. Prefer to browse by
        type? See the <Link to="/docs">documentation</Link>.
      </p>

      <ConceptSection
        title="Capabilities"
        blurb="Abstract lakehouse capabilities — what the estate does, independent of any implementation."
        nodes={groups.capabilities}
      />
      <ConceptSection
        title="Specifications"
        blurb="Open standards and formats that specify a capability."
        nodes={groups.specifications}
      />
      <ConceptSection
        title="Engines"
        blurb="Query engines and libraries the how-to guides exercise side by side."
        nodes={groups.engines}
      />
      <ConceptSection
        title="Implementations"
        blurb="Concrete implementations of the specifications — catalog servers, storage, and more."
        nodes={groups.implementations}
      />
    </Shell>
  );
}

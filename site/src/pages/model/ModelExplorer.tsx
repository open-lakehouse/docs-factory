// /model: browse the estate model's views with LikeC4's own renderer, select an
// element to see what the docs derive from it, and review it in place.
// URL state: `?view=<id>` (default: index), `?el=<id>`, `?scope=estate`.
import { MessageSquare } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ModelDiagram from "../../components/ModelDiagram";
import ModelInspector, { type Select } from "../../components/model/ModelInspector";
import { likec4model } from "../../explain";
import type { ModelTarget } from "../../lib/content-ref";
import { modelSlug } from "../../lib/content-ref";
import { useModelThreadStats } from "../../lib/model-threads";

const DEFAULT_VIEW = "index";

interface ViewEntry {
  id: string;
  title: string;
}

/** The model's views in four groups, the way the model files are organized. */
function viewGroups(): { label: string; views: ViewEntry[] }[] {
  const groups = new Map<string, ViewEntry[]>([
    ["Landscape", []],
    ["Flows", []],
    ["Deployment", []],
    ["Explain", []],
  ]);
  for (const v of likec4model.views()) {
    const label = v.id.startsWith("explain_")
      ? "Explain"
      : v._type === "dynamic"
        ? "Flows"
        : v._type === "deployment"
          ? "Deployment"
          : "Landscape";
    groups.get(label)?.push({ id: v.id, title: v.titleOrId });
  }
  return [...groups].map(([label, views]) => ({ label, views }));
}

function ThreadCount({ slug }: { slug: string }) {
  const { bySlug } = useModelThreadStats();
  const stats = bySlug.get(slug);
  if (!stats?.open) return null;
  return (
    <span className={stats.unread ? "model-thread-count unread" : "model-thread-count"}>
      <MessageSquare className="size-3" aria-hidden />
      {stats.open}
    </span>
  );
}

export default function ModelExplorer() {
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState("");
  const groups = useMemo(viewGroups, []);
  const viewParam = params.get("view");
  const viewId = viewParam && likec4model.findView(viewParam) ? viewParam : DEFAULT_VIEW;
  const elementId = params.get("el");
  const target: ModelTarget =
    params.get("scope") === "estate"
      ? { kind: "estate" }
      : elementId
        ? { kind: "element", id: elementId }
        : { kind: "view", id: viewId };

  const select: Select = ({ el, view }) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("scope");
      if (view !== undefined) {
        if (view) next.set("view", view);
        else next.delete("view");
      }
      if (el !== undefined) {
        if (el) next.set("el", el);
        else next.delete("el");
      }
      return next;
    });
  };
  const showEstate = () =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("el");
      next.set("scope", "estate");
      return next;
    });

  const q = filter.trim().toLowerCase();
  return (
    <section aria-label="Model explorer" className="model-explorer">
      <nav className="model-views" aria-label="Views">
        <button
          type="button"
          className={target.kind === "estate" ? "model-view-item active" : "model-view-item"}
          onClick={showEstate}
        >
          <span className="truncate">The whole model</span>
          <ThreadCount slug="estate" />
        </button>
        <input
          type="search"
          className="model-view-filter"
          placeholder="Filter views…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {groups.map(({ label, views }) => {
          const shown = views.filter(
            (v) => !q || v.title.toLowerCase().includes(q) || v.id.toLowerCase().includes(q),
          );
          if (shown.length === 0) return null;
          return (
            <div key={label} className="model-view-group">
              <p className="blog-aside-title">{label}</p>
              {shown.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  title={v.id}
                  className={v.id === viewId ? "model-view-item active" : "model-view-item"}
                  onClick={() => select({ view: v.id, el: null })}
                >
                  <span className="truncate">{v.title}</span>
                  <ThreadCount slug={modelSlug({ kind: "view", id: v.id })} />
                </button>
              ))}
            </div>
          );
        })}
      </nav>
      <div className="model-canvas">
        <ModelDiagram
          // Remount per view: ReactLikeC4 fits the viewport on mount.
          key={viewId}
          viewId={viewId}
          onNavigateTo={(to) => select({ view: to, el: null })}
          onNodeClick={(node) => {
            if (node.modelRef) select({ el: String(node.modelRef) });
          }}
          onCanvasClick={() => select({ el: null })}
        />
      </div>
      <aside className="model-inspector-pane" aria-label="Inspector">
        <ModelInspector target={target} select={select} />
      </aside>
    </section>
  );
}

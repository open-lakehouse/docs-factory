import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
// <ReactLikeC4> comes from the Vite plugin's virtual module (likec4:react); the
// custom-node primitives come from `likec4/react`. Both resolve to the same
// bundled likec4 diagram instance, so they share one LikeC4ModelProvider
// context — importing primitives from the standalone @likec4/diagram package
// would use a different context and throw "LikeC4Model not found."
import { ReactLikeC4 } from "likec4:react";
import {
  elementNode,
  ElementNodeContainer,
  ElementShape,
  ElementData,
  ElementActions,
  ElementDetailsButtonWithHandler,
  DefaultHandles,
  useDiagram,
  useUpdateEffect,
} from "likec4/react";
import { likec4model, hasExplainPage, explainHref } from "../explain";
import ExpandableDiagram from "./ExpandableDiagram";

/**
 * No-render child of <ReactLikeC4>: sits inside the diagram's actor context and
 * refits the viewport whenever the frame expands/collapses. ReactLikeC4 only
 * auto-fits when its container grows, so without this an inline collapse leaves
 * the viewport panned off-screen (empty). Two rAFs wait for the CSS-driven
 * container resize to land before fitting.
 */
function RefitOnResize({ expanded }: { expanded: boolean }) {
  const diagram = useDiagram();
  useUpdateEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => diagram.fitDiagram(250));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [expanded]);
  return null;
}

// Fallback reference views (whole-estate) if an element has no scoped view.
const PREFERRED_VIEWS = ["capabilityMap", "technologyCatalog", "referenceContext"];

/**
 * Pick the view to seed the diagram with. Prefer the element's own scoped view
 * (a `view of <element>` authored in architecture/model/explain-views.likec4,
 * surfaced as `element.defaultView`) so the diagram is an ad-hoc neighborhood
 * around the subject. Fall back to a reference view, then any containing view.
 */
function pickViewId(elementId: string): string | null {
  const el = likec4model.findElement(elementId);
  if (!el) return null;
  const scoped = el.defaultView;
  if (scoped) return String(scoped.id);
  const views = [...el.views()].map((v) => String(v.id));
  if (views.length === 0) return null;
  for (const preferred of PREFERRED_VIEWS) {
    if (views.includes(preferred)) return preferred;
  }
  return views[0];
}

const ExplainArrowIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    <path d="M12 7h4" />
    <path d="M12 11h4" />
  </svg>
);

export default function ExplainDiagram({ elementId }: { elementId: string }) {
  const navigate = useNavigate();
  const viewId = pickViewId(elementId);

  // Custom element node: adds an "Explain →" action that routes to the
  // neighbor's explanation page. Memoized so the renderer stays referentially
  // stable across re-renders (navigate is stable from react-router).
  const renderNodes = useMemo(() => {
    const ExplainNode = elementNode(({ nodeProps, nodeModel }) => {
      const nodeId = String(nodeModel.element.id);
      const canExplain = hasExplainPage(nodeId);
      return (
        <ElementNodeContainer nodeProps={nodeProps}>
          <ElementShape {...nodeProps} />
          <ElementData {...nodeProps} />
          <ElementActions
            {...nodeProps}
            extraButtons={
              canExplain
                ? [
                    {
                      key: "explain",
                      icon: <ExplainArrowIcon />,
                      onClick: (e) => {
                        e.stopPropagation();
                        navigate(explainHref(nodeId));
                      },
                    },
                  ]
                : []
            }
          />
          <ElementDetailsButtonWithHandler {...nodeProps} />
          <DefaultHandles />
        </ElementNodeContainer>
      );
    });
    return { element: ExplainNode };
  }, [navigate]);

  if (!viewId) {
    return (
      <p className="muted explain-diagram-empty">
        No diagram yet — this element does not appear in a rendered view.
      </p>
    );
  }

  return (
    <ExpandableDiagram>
      {(expanded) => (
      <ReactLikeC4
        viewId={viewId}
        enableElementDetails
        renderNodes={renderNodes}
        // Hide the top-left LikeC4 control bar (logo + back/forward + the view
        // picker that can jump to ANY view/model) and the search popup — this
        // diagram is scoped to the current element, not a whole-model browser.
        controls={false}
        showNavigationButtons={false}
        enableSearch={false}
        onNavigateTo={(to: string) => {
          // Keep in-diagram view navigation working when a node targets a view.
          const view = likec4model.findView(to);
          const of = view?.viewOf;
          if (of && hasExplainPage(String(of.id))) navigate(explainHref(String(of.id)));
        }}
        style={{ height: "100%", width: "100%" }}
      >
        <RefitOnResize expanded={expanded} />
      </ReactLikeC4>
      )}
    </ExpandableDiagram>
  );
}

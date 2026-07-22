import { useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
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
import { likec4model } from "../explain";
import { explanationHref } from "../explain-bindings";

/** Refit viewport when the diagram container resizes (expand/collapse). */
export function RefitOnResize({ expanded }: { expanded: boolean }) {
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

const ExplainArrowIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    <path d="M12 7h4" />
    <path d="M12 11h4" />
  </svg>
);

interface ModelDiagramProps {
  viewId: string;
  dynamicViewVariant?: "sequence" | "diagram";
  /** When true, nodes with explain pages get an "Explain →" action button. */
  showExplainActions?: boolean;
  /** Optional child rendered inside ReactLikeC4 (e.g. RefitOnResize). */
  children?: ReactNode;
  onNavigateTo?: (to: string) => void;
}

/**
 * Shared LikeC4 renderer for the estate model. Used by ExplainDiagram (inline),
 * ModelDiagramModal (popup), and Markdown `likec4=<viewId>` embeds.
 */
export default function ModelDiagram({
  viewId,
  dynamicViewVariant,
  showExplainActions = false,
  children,
  onNavigateTo,
}: ModelDiagramProps) {
  const navigate = useNavigate();

  const renderNodes = useMemo(() => {
    if (!showExplainActions) return undefined;
    const ExplainNode = elementNode(({ nodeProps, nodeModel }) => {
      const nodeId = String(nodeModel.element.id);
      const explainTo = explanationHref(nodeId);
      const canExplain = explainTo !== null;
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
                        if (explainTo) navigate(explainTo);
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
  }, [navigate, showExplainActions]);

  const handleNavigateTo =
    onNavigateTo ??
    ((to: string) => {
      const view = likec4model.findView(to);
      const of = view?.viewOf;
      const to2 = of ? explanationHref(String(of.id)) : null;
      if (to2) navigate(to2);
    });

  return (
    <ReactLikeC4
      viewId={viewId}
      dynamicViewVariant={dynamicViewVariant}
      enableElementDetails
      renderNodes={renderNodes}
      controls={false}
      showNavigationButtons={false}
      enableSearch={false}
      fitViewPadding="48px"
      onNavigateTo={handleNavigateTo}
      style={{ height: "100%", width: "100%" }}
    >
      {children}
    </ReactLikeC4>
  );
}

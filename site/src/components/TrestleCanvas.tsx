// The interactive half of <TrestleDiagram>, loaded only on pages with a
// diagram. Each node's name and role line becomes a model reference with the
// same hover card as inline `model:` links, and a chip counts the asset kinds it
// manages. Internal scope: drafts and non-public elements resolve too.
import {
  EnvironmentDiagram,
  type GraphNodeDto,
  type NodeSlots,
  useDiagramPortal,
} from "@open-lakehouse/trestle-diagram";
import "@open-lakehouse/trestle-diagram/styles.css";
import { Layers } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import context from "../../../architecture/dist/trestle-context.json";
import { nodeAssets, nodeConcepts } from "../content-core/trestle-refs.mjs";
import { type ModelRefInfo, resolveRef } from "../model-refs";
import EntityCard from "./EntityCard";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "./ui/hover-card";

/** `partial` is the role label of a node that meets the concept only with another's help. */
function DiagramModelRef({
  id,
  partial,
  children,
}: {
  id: string;
  partial?: string;
  children: ReactNode;
}) {
  const portal = useDiagramPortal();
  const info = resolveRef(id);
  if (!info) return children;
  const note = partial && `${partial} meets ${info.title} together with another component.`;
  const summary = note ? `${info.summary} ${note}`.trim() : info.summary;
  const label = info.href ? (
    <Link to={info.href} className="model-ref-label">
      {children}
    </Link>
  ) : info.externalUrl ? (
    <a
      href={info.externalUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="model-ref-label"
    >
      {children}
    </a>
  ) : (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: focus opens the card for keyboard readers.
    <span className="model-ref-label" tabIndex={0}>
      {children}
    </span>
  );
  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>{label}</HoverCardTrigger>
      <HoverCardContent align="start" className="entity-hovercard" container={portal}>
        <EntityCard
          data={{
            title: info.title,
            kindLabel: info.kindLabel,
            summary,
            href: info.href ?? info.externalUrl,
            externalUrl: info.href ? info.externalUrl : null,
          }}
        />
      </HoverCardContent>
    </HoverCard>
  );
}

function AssetsChip({ assets }: { assets: ModelRefInfo[] }) {
  const portal = useDiagramPortal();
  const label = `${assets.length} asset ${assets.length === 1 ? "kind" : "kinds"}`;
  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        {/* biome-ignore lint/a11y/noNoninteractiveTabindex: focus opens the card for keyboard readers. */}
        <span className="node-assets" tabIndex={0}>
          <Layers aria-hidden="true" />
          {assets.length}
        </span>
      </HoverCardTrigger>
      <HoverCardContent align="end" className="entity-hovercard" container={portal}>
        <div className="entity-card">
          <div className="entity-card-header">
            <p className="entity-card-title">Manages</p>
            <span className="kind-badge entity-card-kind">{label}</span>
          </div>
          <ul className="entity-card-assets">
            {assets.map((asset) => (
              <li key={asset.id}>
                {asset.href ? (
                  <Link to={asset.href} className="model-ref-label">
                    {asset.title}
                  </Link>
                ) : (
                  asset.title
                )}
              </li>
            ))}
          </ul>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

const slots: NodeSlots = {
  name: (node: GraphNodeDto, fallback) => {
    const { name } = nodeConcepts(node, context.roles);
    return name && resolveRef(name) ? (
      <DiagramModelRef id={name}>{fallback}</DiagramModelRef>
    ) : undefined;
  },
  role: (node: GraphNodeDto, fallback) => {
    const { role } = nodeConcepts(node, context.roles);
    if (!role || !resolveRef(role.id)) return undefined;
    return (
      <DiagramModelRef id={role.id} partial={role.scope === "partial" ? fallback : undefined}>
        {fallback}
      </DiagramModelRef>
    );
  },
  aside: (node: GraphNodeDto) => {
    const assets = nodeAssets(node, context.concepts).flatMap((id: string) => resolveRef(id) ?? []);
    return assets.length ? <AssetsChip assets={assets} /> : undefined;
  },
};

export default function TrestleCanvas({
  snapshot,
  colorMode,
  label,
  readFile,
}: {
  snapshot: unknown;
  colorMode: "light" | "dark";
  label?: string;
  readFile?: (path: string) => Promise<string>;
}) {
  return (
    <EnvironmentDiagram
      snapshot={snapshot}
      label={label}
      colorMode={colorMode}
      slots={slots}
      readFile={readFile}
    />
  );
}

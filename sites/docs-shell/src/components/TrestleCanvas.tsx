// The interactive half of <TrestleDiagram>, split out so the diagram package
// (React Flow + ELK) loads only on pages that have a diagram. Each node's name
// and role line links to the concept it stands for, from the site's refs.json,
// and a chip counts the asset kinds it manages.
import {
  EnvironmentDiagram,
  type GraphNodeDto,
  type NodeSlots,
} from "@open-lakehouse/trestle-diagram";
import "@open-lakehouse/trestle-diagram/styles.css";
import { useEffect, useMemo, useState } from "react";
import { AssetsChip } from "./AssetsChip";
import { type Concept, ConceptRef } from "./ConceptRef";

type TrestleRefs = {
  roles: Record<string, { concept: string; scope: "full" | "partial" }>;
  concepts: Record<string, Concept>;
};

const REFS_URL = "/assets/trestle/refs.json";
let refsRequest: Promise<TrestleRefs | null> | undefined;

// One request per page, however many diagrams it has.
function loadRefs(): Promise<TrestleRefs | null> {
  refsRequest ??= fetch(REFS_URL)
    .then((r) => (r.ok ? (r.json() as Promise<TrestleRefs>) : null))
    .catch(() => null);
  return refsRequest;
}

function nodeSlots(refs: TrestleRefs): NodeSlots {
  return {
    name: (node: GraphNodeDto, fallback) => {
      const concept = node.model ? refs.concepts[node.model] : undefined;
      return concept ? <ConceptRef concept={concept}>{fallback}</ConceptRef> : undefined;
    },
    role: (node: GraphNodeDto, fallback) => {
      const mapped = node.role ? refs.roles[node.role] : undefined;
      const concept = mapped ? refs.concepts[mapped.concept] : undefined;
      if (!mapped || !concept) return undefined;
      const partial =
        mapped.scope === "partial"
          ? `${fallback} meets ${concept.title} together with another component.`
          : undefined;
      return (
        <ConceptRef concept={concept} note={partial}>
          {fallback}
        </ConceptRef>
      );
    },
    aside: (node: GraphNodeDto) => {
      const ids = node.model ? refs.concepts[node.model]?.assets : undefined;
      const assets = (ids ?? []).flatMap((id) => refs.concepts[id] ?? []);
      return assets.length ? <AssetsChip assets={assets} /> : undefined;
    },
  };
}

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
  const [refs, setRefs] = useState<TrestleRefs | null>(null);
  useEffect(() => {
    let live = true;
    loadRefs().then((r) => live && setRefs(r));
    return () => {
      live = false;
    };
  }, []);
  const slots = useMemo(() => (refs ? nodeSlots(refs) : undefined), [refs]);

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

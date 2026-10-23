"""ADR-0008's rules for applying the model vocabulary, checked over model.json.

Unlike ``frontmatter.model_quality_gaps``, which reports facts the model hasn't
caught up on yet, these are structural: a violation means an edge or element
says something the vocabulary doesn't allow, so they fail ``docsnip check``.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

# relationship kind → (allowed source kinds, allowed target kinds). Kinds not
# listed (`flows`) are unconstrained; `dependsOn` is the fallback for anything
# no refinement fits, except between implementations (`integrates` / `builtOn`).
_ENDPOINTS: dict[str, tuple[set[str], set[str]]] = {
    "registeredIn": ({"asset"}, {"capability"}),
    "locatedAt": ({"asset"}, {"capability", "asset"}),
    "derivedFrom": ({"asset"}, {"asset"}),
    "builtOn": ({"implementation"}, {"implementation"}),
    "integrates": ({"implementation"}, {"implementation"}),
    "uses": ({"person"}, {"capability"}),
    "specifies": ({"openSpecification"}, {"capability", "concern"}),
    "implements": ({"implementation"}, {"openSpecification"}),
    "consumes": ({"implementation"}, {"openSpecification"}),
    "realizes": ({"implementation"}, {"capability", "concern"}),
    "governs": ({"openSpecification"}, {"asset"}),
    "operatesOn": ({"implementation"}, {"asset"}),
    "appliesTo": ({"concern"}, {"asset", "capability"}),
}

# A title that only restates its edge's kind.
_ECHO = re.compile(
    r"^(realizes|implements|specifies|governs|consumes|integrates|builtOn)"
    r"( the [\w -]+ (capability|concern))?$"
)

# Declared on purpose without users: applied on a reconciliation pass (ADR-0008).
_RESERVED_TAGS = {"designed", "prototype"}

# The per-area technology views (views/logical-views.likec4).
_AREA_VIEW = re.compile(r"^tech[A-Z]")


def _text(value: object) -> str:
    if isinstance(value, dict):
        return str(value.get("txt") or value.get("md") or "")
    return str(value or "")


def _within(element: str, ancestor: str) -> bool:
    return element == ancestor or element.startswith(ancestor + ".")


def check(model_json: Path) -> list[str]:
    """One line per violation of ADR-0008's rules; empty when the model conforms."""
    if not model_json.is_file():
        return []
    model = json.loads(model_json.read_text())
    elements: dict[str, dict] = model.get("elements") or {}
    kinds = {eid: el.get("kind") for eid, el in elements.items()}
    edges: list[tuple[str, str, str, str]] = [
        (
            str(rel.get("kind") or ""),
            str((rel.get("source") or {}).get("model") or ""),
            str((rel.get("target") or {}).get("model") or ""),
            _text(rel.get("title")),
        )
        for rel in (model.get("relations") or {}).values()
    ]
    errors: list[str] = []

    for kind, source, target, title in edges:
        edge = f"{source} -[{kind}]-> {target}"
        allowed = _ENDPOINTS.get(kind)
        if allowed and (
            kinds.get(source) not in allowed[0] or kinds.get(target) not in allowed[1]
        ):
            errors.append(
                f"  - {edge}: `{kind}` joins {'/'.join(sorted(allowed[0]))} to "
                f"{'/'.join(sorted(allowed[1]))}, not {kinds.get(source)} to {kinds.get(target)}"
            )
        if (
            kind == "dependsOn"
            and kinds.get(source) == kinds.get(target) == "implementation"
        ):
            errors.append(
                f"  - {edge}: between implementations use `integrates` (host to "
                "plugin or library) or `builtOn` (a required core)"
            )
        if title and _ECHO.match(title):
            errors.append(f'  - {edge}: the title "{title}" restates the kind; drop it')

    # An implementation that implements a spec realizes what the spec specifies,
    # so "what realizes X?" is one hop.
    specifies = {(s, t) for k, s, t, _ in edges if k == "specifies"}
    realizes = {(s, t) for k, s, t, _ in edges if k == "realizes"}
    for kind, impl, spec, _ in edges:
        if kind != "implements":
            continue
        for s, capability in specifies:
            if s == spec and not any(
                src == impl and _within(t, capability) for src, t in realizes
            ):
                errors.append(
                    f"  - {impl} implements {spec}, which specifies {capability}, "
                    f"but doesn't realize {capability}"
                )

    # A parent concern's scope is its facets'.
    for eid, kind in kinds.items():
        has_facets = any(
            kinds.get(c) == "concern" and c.startswith(eid + ".") for c in kinds
        )
        if (
            kind == "concern"
            and has_facets
            and any(k == "appliesTo" and s == eid for k, s, _, _ in edges)
        ):
            errors.append(
                f"  - {eid}: a concern with facets carries no appliesTo of its own; "
                "put the edge on a facet"
            )

    for eid, kind in kinds.items():
        if kind == "openSpecification" and not eid.endswith("Spec"):
            errors.append(f"  - {eid}: a specification's id ends in `Spec`")

    deployments = (model.get("deployments") or {}).get("elements") or {}
    for node in deployments.values():
        target = node.get("element")
        if target and kinds.get(target) != "implementation":
            errors.append(
                f"  - deployment {node.get('id')}: instanceOf {target}, a "
                f"{kinds.get(target)}; a node is an instance of an implementation"
            )

    spec = model.get("specification") or {}
    used_relations = {k for k, *_ in edges} | {
        r.get("kind")
        for r in ((model.get("deployments") or {}).get("relations") or {}).values()
    }
    for kind in spec.get("relationships") or {}:
        if kind not in used_relations:
            errors.append(f"  - relationship kind `{kind}` is declared but unused")
    for kind in spec.get("elements") or {}:
        if kind not in set(kinds.values()):
            errors.append(f"  - element kind `{kind}` is declared but unused")
    used_tags = {
        tag
        for item in [
            *elements.values(),
            *(model.get("relations") or {}).values(),
            *deployments.values(),
        ]
        for tag in item.get("tags") or []
    }
    for tag in set(spec.get("tags") or {}) - _RESERVED_TAGS - used_tags:
        errors.append(f"  - tag `#{tag}` is declared but unused")

    views = model.get("views") or {}
    in_area = {
        node.get("id")
        for vid, view in views.items()
        if _AREA_VIEW.match(vid)
        for node in view.get("nodes") or []
    }
    if any(_AREA_VIEW.match(vid) for vid in views):
        for eid, kind in sorted(kinds.items()):
            if kind in ("implementation", "openSpecification") and eid not in in_area:
                errors.append(
                    f"  - {eid}: in no technology area view (tech* in "
                    "views/logical-views.likec4)"
                )
    return errors

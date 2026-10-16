"""Joins Trestle's module catalog to the estate model.

Reads only committed files: the pin (``envs/trestle.toml``), Trestle's catalog
snapshot (``architecture/dist/trestle-catalog.json``, written by
``just trestle-catalog``), the role map (``architecture/integrations/trestle.yaml``),
and the model export. A module's ``model`` ref names an implementation (Trestle
owns it); the role map says what each role contributes (docs-factory owns it).
Dangling or wrong-kind references fail; coverage gaps are reported.
"""

from __future__ import annotations

import dataclasses
import json
import re
import tomllib
from pathlib import Path

import yaml

from .compat import Model, _check_element, load_model

PIN = "envs/trestle.toml"
CATALOG = "architecture/dist/trestle-catalog.json"
MAP = "architecture/integrations/trestle.yaml"
CONTEXT = "architecture/dist/trestle-context.json"
MODEL = "architecture/dist/model.json"

CATALOG_FORMAT = "trestle-catalog"
CATALOG_VERSION = 1
MAP_VERSION = 1
CONTEXT_FORMAT = "docs-factory-trestle-context"
CONTEXT_VERSION = 1
SCOPES = ("full", "partial")

_REV_RE = re.compile(r"[0-9a-f]{40}")
_TARGET_KINDS = {"capability", "concern"}
_ENTRY_KEYS = {"target", "scope", "unmapped"}


@dataclasses.dataclass(frozen=True)
class Pin:
    git: str
    rev: str
    package: str


@dataclasses.dataclass(frozen=True)
class Module:
    id: str
    model: str | None
    role: str | None  # Trestle's `provider_of`: at most one role per module
    title: str
    summary: str | None


@dataclasses.dataclass(frozen=True)
class Catalog:
    version: int
    baseline: str  # e.g. "olai-stack-topology@0.0.5"
    digest: str
    revision: str
    modules: tuple[Module, ...]

    @property
    def name(self) -> str:
        return self.baseline.split("@", 1)[0]


@dataclasses.dataclass(frozen=True)
class Entry:
    target: str | None
    scope: str | None
    unmapped: str | None


@dataclasses.dataclass(frozen=True)
class RoleMap:
    catalog: str
    roles: dict[str, Entry]
    aliases: dict[str, str]  # former role id → current id

    def canonical(self, role: str) -> str:
        return self.aliases.get(role, role)


# --- loading ------------------------------------------------------------------


class _UniqueKeyLoader(yaml.SafeLoader):
    """PyYAML keeps the last of two equal keys; a role mapped twice must fail."""


def _construct_unique(loader: yaml.SafeLoader, node: yaml.MappingNode) -> dict:
    seen: set[object] = set()
    for key_node, _ in node.value:
        key = loader.construct_object(key_node)
        if key in seen:
            raise ValueError(
                f"{MAP}: line {key_node.start_mark.line + 1}: duplicate key '{key}'"
            )
        seen.add(key)
    return loader.construct_mapping(node)


_UniqueKeyLoader.add_constructor(yaml.SafeLoader.DEFAULT_MAPPING_TAG, _construct_unique)


def load_pin(root: Path) -> Pin:
    raw = tomllib.loads((root / PIN).read_text()).get("trestle") or {}
    git, rev, package = raw.get("git"), raw.get("rev"), raw.get("package")
    if not isinstance(git, str) or not git:
        raise ValueError(f"{PIN}: trestle.git must be a URL")
    if not isinstance(rev, str) or not _REV_RE.fullmatch(rev):
        raise ValueError(f"{PIN}: trestle.rev must be a full 40-character commit SHA")
    if not isinstance(package, str) or not package:
        raise ValueError(f"{PIN}: trestle.package must be a crate name")
    return Pin(git, rev, package)


def load_catalog(root: Path) -> Catalog:
    data = json.loads((root / CATALOG).read_text())
    if data.get("format") != CATALOG_FORMAT:
        raise ValueError(
            f"{CATALOG}: format {data.get('format')!r} is not {CATALOG_FORMAT}"
        )
    version = data.get("version")
    if version != CATALOG_VERSION:
        raise ValueError(f"{CATALOG}: unsupported version {version!r}")
    identity = data.get("catalog") or {}
    baseline, digest = identity.get("baseline"), identity.get("digest")
    if not isinstance(baseline, str) or not isinstance(digest, str):
        raise ValueError(f"{CATALOG}: catalog.baseline and catalog.digest are required")
    revision = (data.get("generator") or {}).get("revision")
    if not isinstance(revision, str):
        # A build without TRESTLE_REVISION; `just trestle-install` always sets it.
        raise ValueError(
            f"{CATALOG}: generator.revision is missing; run `just trestle-catalog`"
        )
    modules = []
    for m in data.get("modules") or []:
        if not isinstance(m, dict) or not isinstance(m.get("id"), str):
            raise ValueError(f"{CATALOG}: every module needs a string id")
        modules.append(
            Module(
                id=m["id"],
                model=m.get("model"),
                role=m.get("provider_of"),
                title=m.get("display_name") or m["id"],
                summary=m.get("summary"),
            )
        )
    return Catalog(version, baseline, digest, revision, tuple(modules))


def load_map(root: Path) -> RoleMap:
    raw = yaml.load((root / MAP).read_text(), Loader=_UniqueKeyLoader) or {}
    if raw.get("version") != MAP_VERSION:
        raise ValueError(f"{MAP}: version must be {MAP_VERSION}")
    catalog = raw.get("catalog")
    if not isinstance(catalog, str) or not catalog:
        raise ValueError(f"{MAP}: catalog must name the catalog baseline")
    roles: dict[str, Entry] = {}
    for role, entry in (raw.get("roles") or {}).items():
        where = f"{MAP}: roles.{role}"
        if not isinstance(entry, dict) or not set(entry) <= _ENTRY_KEYS:
            raise ValueError(f"{where}: keys are target + scope, or unmapped")
        target, scope, unmapped = (
            entry.get("target"),
            entry.get("scope"),
            entry.get("unmapped"),
        )
        if (target is None) == (unmapped is None):
            raise ValueError(f"{where}: set exactly one of target and unmapped")
        if unmapped is not None:
            if not isinstance(unmapped, str) or not unmapped or scope is not None:
                raise ValueError(f"{where}: unmapped takes a reason and no scope")
        elif scope not in SCOPES:
            raise ValueError(f"{where}: scope must be one of {', '.join(SCOPES)}")
        roles[role] = Entry(target, scope, unmapped)
    aliases = raw.get("aliases") or {}
    if not isinstance(aliases, dict):
        raise ValueError(f"{MAP}: aliases maps a former role id to its current id")
    for old, new in aliases.items():
        if old in roles:
            raise ValueError(f"{MAP}: aliases.{old}: the role also has its own entry")
        if new in aliases:
            raise ValueError(f"{MAP}: aliases.{old}: '{new}' is itself an alias")
        if new not in roles:
            raise ValueError(f"{MAP}: aliases.{old}: '{new}' has no entry")
    return RoleMap(catalog, roles, {str(k): str(v) for k, v in aliases.items()})


def _partial_edges(root: Path) -> set[tuple[str, str, str]]:
    path = root / MODEL
    if not path.is_file():
        return set()
    relations = json.loads(path.read_text()).get("relations") or {}
    return {
        (
            str(rel.get("kind")),
            str((rel.get("source") or {}).get("model")),
            str((rel.get("target") or {}).get("model")),
        )
        for rel in relations.values()
        if "partial" in (rel.get("tags") or [])
    }


# --- checks -------------------------------------------------------------------


def _within(element: str, target: str) -> bool:
    """A facet (lakehouse.governance.authentication) counts toward its parent."""
    return element == target or element.startswith(target + ".")


def backing(model: Model, ref: str, target: str) -> list[tuple[str, str, str]]:
    """The model edges by which implementation ``ref`` contributes to ``target``:
    ``realizes`` it (or a facet of it), or ``implements`` a spec that ``specifies`` it."""
    found = [
        (kind, source, dest)
        for kind, source, dest in sorted(model.edges)
        if kind == "realizes" and source == ref and _within(dest, target)
    ]
    for kind, source, spec in sorted(model.edges):
        if kind == "implements" and source == ref:
            if any(
                k == "specifies" and s == spec and _within(t, target)
                for k, s, t in model.edges
            ):
                found.append((kind, source, spec))
    return found


@dataclasses.dataclass
class Report:
    errors: list[str]
    gaps: list[str]


def check(root: Path) -> Report:
    """Validate the committed Trestle join. Nothing to check before a role map exists."""
    report = Report([], [])
    if not (root / MAP).is_file():
        return report
    try:
        pin = load_pin(root)
        catalog = load_catalog(root)
        roles = load_map(root)
    except (OSError, ValueError) as exc:
        report.errors.append(str(exc))
        return report
    model = load_model(root)
    partial = _partial_edges(root)
    errors, gaps = report.errors, report.gaps

    if catalog.revision != pin.rev:
        errors.append(
            f"{CATALOG}: rendered by Trestle {catalog.revision}, but {PIN} pins "
            f"{pin.rev}; run `just trestle-catalog`"
        )
    if roles.catalog != catalog.name:
        errors.append(
            f"{MAP}: interprets catalog '{roles.catalog}', but the snapshot is "
            f"'{catalog.name}'"
        )

    for role, entry in sorted(roles.roles.items()):
        if entry.target is not None:
            _check_element(
                model,
                entry.target,
                _TARGET_KINDS,
                "target",
                f"{MAP}: roles.{role}",
                errors,
            )

    provided: set[str] = set()
    for module in catalog.modules:
        where = f"{CATALOG}: module {module.id}"
        ref_ok = False
        if module.model is None:
            gaps.append(f"  - trestle: module {module.id} has no model ref")
        else:
            ref_ok = _check_element(
                model, module.model, {"implementation"}, "model ref", where, errors
            )
        if module.role is None:
            continue
        role = roles.canonical(module.role)
        provided.add(role)
        entry = roles.roles.get(role)
        if entry is None:
            gaps.append(
                f"  - trestle: role {module.role} (module {module.id}) has no entry in {MAP}"
            )
            continue
        if (
            entry.target is None
            or not ref_ok
            or not model.kinds
            or module.model is None
        ):
            continue
        if entry.target not in model.kinds:
            continue
        edges = backing(model, module.model, entry.target)
        if not edges:
            gaps.append(
                f"  - trestle: module {module.id} contributes {role} → {entry.target}, "
                f"but {module.model} has no realizes/implements path to it"
            )
        elif entry.scope == "full" and all(e in partial for e in edges):
            gaps.append(
                f"  - trestle: {MAP} maps {role} fully to {entry.target}, but "
                f"{module.model} only realizes it #partial"
            )

    for role in sorted(set(roles.roles) - provided):
        gaps.append(
            f"  - trestle: {MAP} maps role {role}, which no catalog module provides"
        )

    if not errors:
        expected = render_context(root, catalog, roles, model)
        path = root / CONTEXT
        if not path.is_file() or path.read_text() != expected:
            errors.append(f"{CONTEXT} is stale; run `uv run docsnip trestle --fix`")
    return report


# --- the portable context artifact --------------------------------------------


def _description(element: dict) -> str | None:
    desc = element.get("description")
    if isinstance(desc, dict):
        desc = desc.get("txt") or desc.get("md")
    return desc.strip() if isinstance(desc, str) and desc.strip() else None


def render_context(root: Path, catalog: Catalog, roles: RoleMap, model: Model) -> str:
    """Per module and role, the concepts they stand for, for Trestle's diagram.

    Only model facts (titles, descriptions, external links): no docs-site page,
    path, or draft content, whose public URLs wait for the site projection."""
    path = root / MODEL
    elements = (
        (json.loads(path.read_text()).get("elements") or {}) if path.is_file() else {}
    )
    concepts: dict[str, dict[str, object]] = {}

    def concept(eid: str) -> None:
        element = elements.get(eid)
        if element is None or "generated" in (element.get("tags") or []):
            return
        entry: dict[str, object] = {
            "kind": element.get("kind"),
            "title": element.get("title") or eid,
        }
        if desc := _description(element):
            entry["description"] = desc
        links = [link["url"] for link in element.get("links") or [] if link.get("url")]
        if links:
            entry["links"] = links
        concepts[eid] = entry

    modules: dict[str, dict[str, object]] = {}
    for module in sorted(catalog.modules, key=lambda m: m.id):
        entry: dict[str, object] = {"title": module.title}
        if module.role is not None:
            entry["role"] = roles.canonical(module.role)
        if module.model is not None and module.model in elements:
            entry["model"] = module.model
            concept(module.model)
            specs = sorted(
                t for k, s, t in model.edges if k == "implements" and s == module.model
            )
            for spec in specs:
                concept(spec)
            if specs:
                entry["implements"] = specs
        modules[module.id] = entry

    role_entries: dict[str, dict[str, object]] = {}
    for role, mapped in sorted(roles.roles.items()):
        if mapped.target is None:
            role_entries[role] = {"unmapped": mapped.unmapped}
            continue
        role_entries[role] = {"target": mapped.target, "scope": mapped.scope}
        concept(mapped.target)

    artifact = {
        "format": CONTEXT_FORMAT,
        "version": CONTEXT_VERSION,
        "catalog": {"baseline": catalog.baseline, "digest": catalog.digest},
        "modules": modules,
        "roles": role_entries,
        "concepts": dict(sorted(concepts.items())),
    }
    return json.dumps(artifact, indent=2, ensure_ascii=False) + "\n"


def fix(root: Path) -> bool:
    """Rewrite the context artifact; True when it changed."""
    catalog, roles = load_catalog(root), load_map(root)
    text = render_context(root, catalog, roles, load_model(root))
    path = root / CONTEXT
    if path.is_file() and path.read_text() == text:
        return False
    path.write_text(text)
    return True


def coverage(root: Path) -> list[str]:
    """One line per catalog module: module → model ref, role → target (scope)."""
    catalog, roles = load_catalog(root), load_map(root)
    lines = []
    for module in catalog.modules:
        role = roles.canonical(module.role) if module.role else None
        entry = roles.roles.get(role) if role else None
        if entry is None:
            mapped = "—" if role is None else "(no entry)"
        elif entry.target is None:
            mapped = f"unmapped ({entry.unmapped})"
        else:
            mapped = f"{entry.target} ({entry.scope})"
        lines.append(
            f"{module.id:<16} {module.model or '(no ref)':<18} {role or '—':<20} {mapped}"
        )
    return lines

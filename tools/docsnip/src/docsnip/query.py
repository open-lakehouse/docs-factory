"""Internal agent queries over the committed artifacts.

See docs/design/trestle-integration.md §9.

Reads ``architecture/dist/model.json``, each ``content/<project>/compatibility.json``,
the generated environments (``envs/<name>/plan.json``, the registry and its
generated facts), the Trestle catalog snapshot, role map, and pin, and the
content pages and scripts. Needs no Trestle, cargo, or network.

Every answered item carries an evidence state, the sorted states that hold:

- ``configured``: a generated environment's plan runs it;
- ``tested``: a working proof on a ready page, while the committed
  compatibility artifacts are current (``compat --fix`` would change nothing);
- ``documented``: a ready page explains, references, or ``model:``-links it;

or ``["unknown"]`` when none does. A ``#partial`` edge or a role-map
``scope: partial`` never satisfies a target, and a parent concern holds in an
environment only when every facet is fully realized there.
"""

from __future__ import annotations

import dataclasses
import json
from pathlib import Path

from . import compat, envgen, environments, trestle, versions
from .compat import Model, load_model
from .frontmatter import MODEL_LINK_RE, Page, effective_reference_ids, iter_pages
from .scriptmeta import discover

FORMAT = "docsnip-query"
VERSION = 1
KINDS = ("explain", "environment-for", "examples-for", "explain-selection", "impact")

CONFIGURED, TESTED, DOCUMENTED, UNKNOWN = (
    "configured",
    "tested",
    "documented",
    "unknown",
)
FULL, PARTIAL, MISSING = "full", "partial", "missing"

_MODULE, _PIN = "module:", "pin:"


class QueryError(ValueError):
    """The queried id names nothing in the artifacts."""


@dataclasses.dataclass(frozen=True)
class Proof:
    project: str  # the matrix the claim lands in
    journey: str
    interface: str
    script: str  # repo-relative
    ready: bool
    works: bool

    @property
    def journey_id(self) -> str:
        return f"{self.project}/{self.journey}"


@dataclasses.dataclass(frozen=True)
class Script:
    path: str  # repo-relative
    page: str | None  # repo-relative owning page
    env: str | None  # registry key of its compose file


@dataclasses.dataclass
class Index:
    root: Path
    model: Model
    elements: dict[str, dict]
    partial: set[tuple[str, str, str]]
    views: dict[str, set[str]]  # view id → node modelRefs
    pages: dict[str, Page]  # repo-relative path → page
    scripts: dict[str, Script]
    journeys: dict[str, dict]  # "<project>/<journey>" → artifact record
    interfaces: dict[str, str | None]  # "<project>/<interface>" → model element
    proofs: list[Proof]
    stale: list[str]  # compatibility artifacts compat --fix would rewrite
    plans: dict[str, dict]  # generated environment name → plan.json
    registry: dict[str, environments.Environment]
    facts: dict[str, dict]  # generated name → environments.generated.json entry
    catalog: trestle.Catalog | None
    roles: trestle.RoleMap | None
    pin: trestle.Pin | None


def _rel(root: Path, path: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def _optional(load, root: Path):
    try:
        return load(root)
    except (OSError, ValueError):
        return None


def load(root: Path) -> Index:
    model_path = root / trestle.MODEL
    data = json.loads(model_path.read_text()) if model_path.is_file() else {}
    content = root / "content"
    pages = (
        {_rel(root, page.path): page for page in iter_pages(content)}
        if content.is_dir()
        else {}
    )
    scripts = {}
    for meta in discover(content) if content.is_dir() else []:
        compose = meta.compose_path()
        page = meta.owning_page()
        path = _rel(root, meta.path)
        scripts[path] = Script(
            path,
            _rel(root, page) if page else None,
            environments.key_for(compose, root) if compose else None,
        )
    journeys: dict[str, dict] = {}
    interfaces: dict[str, str | None] = {}
    proofs = []
    for path in sorted(content.glob(f"*/{compat.ARTIFACT}")):
        artifact = json.loads(path.read_text())
        project = str(artifact["project"])
        for iface in artifact.get("interfaces") or []:
            interfaces[f"{project}/{iface['key']}"] = iface.get("model")
        for journey in artifact.get("journeys") or []:
            journeys[f"{project}/{journey['id']}"] = journey
            for iface, cell in sorted((journey.get("cells") or {}).items()):
                for p in cell.get("proofs") or []:
                    proofs.append(
                        Proof(
                            project,
                            journey["id"],
                            iface,
                            p["script"],
                            bool(p.get("ready")),
                            bool(p.get("works")),
                        )
                    )
    plans = {}
    for name in envgen.names(root):
        try:
            plans[name] = envgen.load_plan(root, name)
        except ValueError:
            continue
    facts_path = root / environments.GENERATED
    facts = (
        json.loads(facts_path.read_text()).get("environments") or {}
        if facts_path.is_file()
        else {}
    )
    views = {
        vid: {n["modelRef"] for n in view.get("nodes") or [] if n.get("modelRef")}
        for vid, view in (data.get("views") or {}).items()
    }
    return Index(
        root=root,
        model=load_model(root),
        elements=data.get("elements") or {},
        partial=trestle.partial_edges(root),
        views=views,
        pages=pages,
        scripts=scripts,
        journeys=journeys,
        interfaces=interfaces,
        proofs=proofs,
        stale=[_rel(root, p) for p in compat.stale(root)],
        plans=plans,
        registry=_optional(environments.load, root) or {},
        facts=facts,
        catalog=_optional(trestle.load_catalog, root),
        roles=_optional(trestle.load_map, root),
        pin=_optional(trestle.load_pin, root),
    )


# --- model facts ----------------------------------------------------------------


def _text(element: dict) -> str | None:
    for key in ("summary", "description"):
        value = element.get(key)
        if isinstance(value, dict):
            value = value.get("txt") or value.get("md")
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _public(idx: Index, eid: str) -> bool:
    return "public" in (idx.elements.get(eid, {}).get("tags") or [])


def _element(idx: Index, eid: str) -> dict:
    if eid not in idx.elements:
        raise QueryError(f"no model element '{eid}'")
    return idx.elements[eid]


def _nodes(plan: dict) -> list[dict]:
    return [n for n in plan["graph"].get("nodes") or [] if n.get("kind") != "clients"]


def _runs(idx: Index, name: str, eid: str) -> bool:
    """The environment runs ``eid``, or an implementation backing or implementing it."""
    for impl in envgen.implementations(idx.plans[name]):
        if impl == eid or ("implements", impl, eid) in idx.model.edges:
            return True
        if trestle.backing(idx.model, impl, eid):
            return True
    return False


def _contribution(idx: Index, name: str, target: str) -> dict:
    """How the environment's nodes meet a leaf ``target``: implementation → scope."""
    by: dict[str, str] = {}
    for node in _nodes(idx.plans[name]):
        impl = node.get("model")
        if impl is None:
            continue
        edges = trestle.backing(idx.model, impl, target)
        if not edges:
            continue
        scope = FULL if any(e not in idx.partial for e in edges) else PARTIAL
        entry = (
            idx.roles.roles.get(idx.roles.canonical(node["role"]))
            if idx.roles and node.get("role")
            else None
        )
        if (
            entry is not None
            and entry.scope == PARTIAL
            and entry.target is not None
            and trestle.within(entry.target, target)
        ):
            scope = PARTIAL
        if by.get(impl) != FULL:
            by[impl] = scope
    return by


def status(idx: Index, name: str, target: str) -> dict:
    """``full``, ``partial``, or ``missing`` in environment ``name``. A parent
    concern rolls its facets up: full only when every facet is."""
    concern = idx.model.kinds.get(target) == "concern"
    parts = trestle.facets(idx.model, target) if concern else []
    if not parts:
        by = _contribution(idx, name, target)
        state = FULL if FULL in by.values() else PARTIAL if by else MISSING
        return {"status": state, "by": dict(sorted(by.items()))}
    facets = {f: status(idx, name, f) for f in parts}
    states = {f: s["status"] for f, s in facets.items()}
    if all(s == FULL for s in states.values()):
        state = FULL
    elif all(s == MISSING for s in states.values()):
        state = MISSING
    else:
        state = PARTIAL
    return {
        "status": state,
        "missing": [f for f, s in states.items() if s == MISSING],
        "partial": [f for f, s in states.items() if s == PARTIAL],
        "facets": facets,
    }


# --- evidence -------------------------------------------------------------------


def _cites(page: Page) -> set[str]:
    return effective_reference_ids(page.meta) | set(MODEL_LINK_RE.findall(page.body))


def _ready(page: Page | None) -> bool:
    return page is not None and page.meta.get("status") == "ready"


def _involves(idx: Index, proof: Proof, eid: str) -> list[str]:
    """How a proof's journey touches ``eid``: as its asset, a requirement, or
    the interface's model element."""
    journey = idx.journeys.get(proof.journey_id) or {}
    via = []
    asset = journey.get("asset")
    if asset and trestle.within(asset, eid):
        via.append("asset")
    if any(
        eid in ids
        for edges in (journey.get("requires") or {}).values()
        for ids in edges.values()
    ):
        via.append("requires")
    if idx.interfaces.get(f"{proof.project}/{proof.interface}") == eid:
        via.append("interface")
    return via


def _working(idx: Index, proof: Proof) -> bool:
    return proof.ready and proof.works and not idx.stale


def _states(configured: bool, tested: bool, documented: bool) -> list[str]:
    held = [
        state
        for state, holds in (
            (CONFIGURED, configured),
            (DOCUMENTED, documented),
            (TESTED, tested),
        )
        if holds
    ]
    return sorted(held) or [UNKNOWN]


def element_evidence(idx: Index, eid: str) -> list[str]:
    return _states(
        any(_runs(idx, name, eid) for name in idx.plans),
        any(_working(idx, p) and _involves(idx, p, eid) for p in idx.proofs),
        any(_ready(page) and eid in _cites(page) for page in idx.pages.values()),
    )


def _env_name(idx: Index, key: str | None) -> str | None:
    env = idx.registry.get(key) if key else None
    return env.generated if env and env.generated in idx.plans else None


def script_evidence(idx: Index, script: str, proof: Proof | None = None) -> list[str]:
    found = idx.scripts.get(script)
    page = idx.pages.get(found.page) if found and found.page else None
    return _states(
        _env_name(idx, found.env if found else None) is not None,
        _working(idx, proof)
        if proof is not None
        else any(p.script == script and _working(idx, p) for p in idx.proofs),
        _ready(page),
    )


def _envelope(kind: str, ident: str, answer: dict) -> dict:
    return {
        "format": FORMAT,
        "version": VERSION,
        "query": kind,
        "id": ident,
        "answer": answer,
    }


def _compat(idx: Index) -> dict:
    return {"compat": "stale", "staleArtifacts": idx.stale} if idx.stale else {}


# --- queries --------------------------------------------------------------------


def explain(idx: Index, eid: str) -> dict:
    element = _element(idx, eid)
    cited = [
        {"page": path, "status": str(page.meta.get("status", "draft"))}
        for path, page in sorted(idx.pages.items())
        if eid in _cites(page)
    ]
    canonical = next(
        (
            p
            for p, page in sorted(idx.pages.items())
            if page.meta.get("explains") == eid
        ),
        None,
    )
    out = [
        {"kind": k, "target": t, "partial": (k, s, t) in idx.partial}
        for k, s, t in sorted(idx.model.edges)
        if s == eid
    ]
    inbound = [
        {"kind": k, "source": s, "partial": (k, s, t) in idx.partial}
        for k, s, t in sorted(idx.model.edges)
        if t == eid
    ]
    backers = trestle.realizers(idx.model, eid)
    answer: dict[str, object] = {
        "element": eid,
        "kind": element.get("kind"),
        "title": element.get("title") or eid,
        "summary": _text(element),
        "public": _public(idx, eid),
        "page": canonical,
        "citedBy": cited,
        "out": out,
        "in": inbound,
        "implementations": [
            {
                "id": impl,
                "edges": [
                    {"edge": list(e), "partial": e in idx.partial} for e in edges
                ],
                "partial": all(e in idx.partial for e in edges),
            }
            for impl, edges in backers.items()
        ],
        "environments": sorted(n for n in idx.plans if _runs(idx, n, eid)),
        "journeys": sorted(
            {p.journey_id for p in idx.proofs if _involves(idx, p, eid)}
            | {
                jid
                for jid, j in idx.journeys.items()
                if j.get("asset") and trestle.within(j["asset"], eid)
            }
        ),
        "evidence": element_evidence(idx, eid),
        **_compat(idx),
    }
    if element.get("kind") in ("concern", "capability"):
        if element.get("kind") == "concern":
            answer["facets"] = trestle.facets(idx.model, eid)
        answer["holds"] = {
            name: {
                "holds": (s := status(idx, name, eid))["status"] == FULL,
                **s,
            }
            for name in sorted(idx.plans)
        }
    return answer


def _environment(idx: Index, key: str) -> dict:
    env = idx.registry.get(key)
    name = env.generated if env else None
    record: dict[str, object] = {
        "key": key,
        "compose": f"envs/{key}",
        "title": env.title if env else None,
        "generated": name,
    }
    if name is not None and name in idx.plans:
        facts = idx.facts.get(name) or {}
        record |= {
            "recipe": f"{envgen.ENVS / name / envgen.RECIPE}",
            "plan": f"{envgen.ENVS / name / envgen.PLAN}",
            "trestle": idx.pin.rev if idx.pin else None,
            "regenerate": f"just env-render {name}",
            "clientEnv": facts.get("client-env") or {},
            "services": [
                {
                    **svc,
                    "public": bool(svc.get("element")) and _public(idx, svc["element"]),
                }
                for svc in facts.get("services") or []
            ],
            "files": facts.get("files") or [],
        }
    return record


def environment_for(idx: Index, target: str) -> dict:
    if target in idx.scripts:
        chosen = [(target, None)]
    elif target in idx.journeys:
        chosen = [
            (p.script, p) for p in idx.proofs if p.journey_id == target and p.works
        ]
    else:
        raise QueryError(f"no script or <project>/<journey> '{target}'")
    by_env: dict[str, list[dict]] = {}
    for script, proof in sorted(
        chosen, key=lambda c: (c[0], c[1] and c[1].interface or "")
    ):
        found = idx.scripts.get(script)
        if found is None or found.env is None:
            continue
        entry: dict[str, object] = {"script": script, "page": found.page}
        if proof is not None:
            entry["interface"] = proof.interface
        entry["evidence"] = script_evidence(idx, script, proof)
        by_env.setdefault(found.env, []).append(entry)
    return {
        "environments": [
            {**_environment(idx, key), "scripts": scripts}
            for key, scripts in sorted(by_env.items())
        ],
        **_compat(idx),
    }


def examples_for(idx: Index, eid: str) -> dict:
    _element(idx, eid)
    found: dict[tuple[str, str | None, str | None], dict] = {}
    for proof in idx.proofs:
        via = _involves(idx, proof, eid)
        if not via:
            continue
        script = idx.scripts.get(proof.script)
        found[(proof.script, proof.journey_id, proof.interface)] = {
            "script": proof.script,
            "page": script.page if script else None,
            "journey": proof.journey_id,
            "interface": proof.interface,
            "via": via,
            "ready": proof.ready,
            "works": proof.works,
            "environment": script.env if script else None,
            "evidence": script_evidence(idx, proof.script, proof),
        }
    for script in idx.scripts.values():
        page = idx.pages.get(script.page) if script.page else None
        if page is None or eid not in _cites(page):
            continue
        if any(k[0] == script.path for k in found):
            for k, v in found.items():
                if k[0] == script.path and "page" not in v["via"]:
                    v["via"].append("page")
            continue
        found[(script.path, None, None)] = {
            "script": script.path,
            "page": script.page,
            "journey": None,
            "interface": None,
            "via": ["page"],
            "ready": _ready(page),
            "works": None,
            "environment": script.env,
            "evidence": script_evidence(idx, script.path),
        }
    return {
        "element": eid,
        "examples": [
            found[k]
            for k in sorted(found, key=lambda k: (k[0], k[1] or "", k[2] or ""))
        ],
        **_compat(idx),
    }


def _resolve_env(idx: Index, ident: str) -> str:
    if ident in idx.plans:
        return ident
    name = _env_name(idx, ident)
    if name is None:
        raise QueryError(f"no generated environment '{ident}' (a name or registry key)")
    return name


def _ancestors(idx: Index, eid: str) -> list[str]:
    parts = eid.split(".")
    return [
        a
        for i in range(1, len(parts))
        if (a := ".".join(parts[:i])) in idx.model.kinds
        and idx.model.kinds[a] == "concern"
    ]


def explain_selection(idx: Index, ident: str) -> dict:
    name = _resolve_env(idx, ident)
    model = idx.model
    services = []
    targets: set[str] = set()
    for node in sorted(_nodes(idx.plans[name]), key=lambda n: n["id"]):
        impl = node.get("model")
        role = (
            idx.roles.canonical(node["role"])
            if idx.roles and node.get("role")
            else node.get("role")
        )
        entry = idx.roles.roles.get(role) if idx.roles and role else None
        record: dict[str, object] = {
            "node": node["id"],
            "element": impl,
            "role": role,
            "target": entry.target if entry else None,
            "scope": entry.scope if entry else None,
        }
        if entry and entry.unmapped:
            record["unmapped"] = entry.unmapped
        if entry and entry.target:
            targets.add(entry.target)
        if impl:
            edges = (
                trestle.backing(model, impl, entry.target)
                if entry and entry.target
                else []
            )
            record["edges"] = [
                {"edge": list(e), "partial": e in idx.partial} for e in edges
            ]
            for k, s, t in model.edges:
                if s != impl:
                    continue
                if k == "realizes":
                    targets.add(t)
                elif k == "implements":
                    targets |= {
                        dest
                        for kk, ss, dest in model.edges
                        if kk == "specifies" and ss == t
                    }
        services.append(record)
    targets = {t for t in targets if model.kinds.get(t) in ("capability", "concern")}
    targets |= {a for t in list(targets) for a in _ancestors(idx, t)}
    targets |= {f for t in list(targets) for f in trestle.facets(model, t)}
    concepts = []
    for t in sorted(targets):
        s = status(idx, name, t)
        s.pop("facets", None)
        concepts.append({"id": t, "kind": model.kinds[t], **s})
    return {
        "environment": name,
        "key": next(
            (k for k, e in sorted(idx.registry.items()) if e.generated == name), None
        ),
        "services": services,
        "concepts": concepts,
    }


def _project(name: str) -> versions.Project:
    for project in versions.PROJECTS:
        if project.name == name:
            return project
    raise QueryError(f"no release project '{name}'")


def impact(idx: Index, ident: str) -> dict:
    files: list[str] = []
    element: str | None = None
    direct: set[str] = set()
    if ident.startswith(_MODULE):
        module = ident[len(_MODULE) :]
        known = {m.id: m for m in (idx.catalog.modules if idx.catalog else ())}
        envs = {
            n
            for n, plan in idx.plans.items()
            if any(x["id"] == module for x in _nodes(plan))
        }
        if module not in known and not envs:
            raise QueryError(f"no Trestle module '{module}'")
        element = known[module].model if module in known else None
        kind = "module"
    elif ident == f"{_PIN}trestle":
        files, envs, kind = [trestle.PIN], set(idx.plans), "pin"
    elif ident.startswith(_PIN):
        project_name, _, key = ident[len(_PIN) :].partition("/")
        project = _project(project_name)
        try:
            pins = versions.load(idx.root, project)
        except (OSError, ValueError) as exc:
            raise QueryError(str(exc)) from exc
        if key not in pins:
            raise QueryError(f"no pin '{key}' in {project.manifest}")
        files = sorted(versions.matches(idx.root, project, key))
        envs = {
            n
            for n in idx.plans
            if any(f.startswith(f"{envgen.ENVS / n}/") for f in files)
        }
        direct = {f for f in files if f in idx.scripts}
        kind = "pin"
    else:
        element = ident
        _element(idx, ident)
        envs = {n for n in idx.plans if _runs(idx, n, ident)}
        kind = "element"
    keys = {k for k, e in idx.registry.items() if e.generated in envs}
    scripts = {s.path for s in idx.scripts.values() if s.env in keys} | direct
    if element is not None:
        scripts |= {p.script for p in idx.proofs if _involves(idx, p, element)}
    claims = sorted(
        {
            (p.journey_id, p.interface, p.script)
            for p in idx.proofs
            if p.script in scripts
        }
    )
    pages = {
        idx.scripts[s].page for s in scripts if s in idx.scripts and idx.scripts[s].page
    }
    pages |= {f for f in files if f in idx.pages}
    citing = (
        sorted(p for p, page in idx.pages.items() if element in _cites(page))
        if element
        else []
    )
    views = (
        sorted(v for v, refs in idx.views.items() if element in refs) if element else []
    )
    views = sorted(
        set(views) | {f"{envgen.ident(n)}Deploy" for n in envs} & set(idx.views)
    )
    return {
        "kind": kind,
        "element": element,
        "files": files,
        "environments": sorted(envs),
        "scripts": sorted(scripts),
        "claims": [{"journey": j, "interface": i, "script": s} for j, i, s in claims],
        "pages": sorted(pages | set(citing)),
        "citingPages": citing,
        "views": views,
        **_compat(idx),
    }


_QUERIES = {
    "explain": explain,
    "environment-for": environment_for,
    "examples-for": examples_for,
    "explain-selection": explain_selection,
    "impact": impact,
}


def run(idx: Index, kind: str, ident: str) -> dict:
    """The answer envelope. Raises :class:`QueryError` for an unknown id."""
    return _envelope(kind, ident, _QUERIES[kind](idx, ident))

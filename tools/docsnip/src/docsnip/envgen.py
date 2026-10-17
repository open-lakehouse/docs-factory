"""Generated environments: a Trestle ``plan.json`` joined to the model and the registry.

An environment folder with an ``env.toml`` (``envs/<name>/``) is rendered by the
pinned Trestle (``just env-render``), which commits the Compose files and
``plan.json`` beside it. This module reads only those committed files plus the
model export and writes two projections of each plan:

- ``architecture/model/deployment/generated/<name>.likec4``: the deployment
  nodes (each ``instanceOf`` its module's implementation) and the runtime edges,
  every edge carrying its plan edge key;
- ``envs/environments.generated.json``: the reader-facing facts the registry
  merges into an entry that says ``generated: <name>`` (host ports, client env),
  and the files the reader bundle ships: the render's runtime files plus each
  ``build`` context, never the recipe or the plan;
- ``envs/<name>/diagram.trestle-graph.json``: the plan's graph as a Trestle
  diagram snapshot, titled from the registry (see :mod:`docsnip.diagrams`).

It never infers an edge the plan doesn't have: a logical blueprint edge is not
a runtime call. Malformed or stale projections fail; ambiguous environment fit
is reported.
"""

from __future__ import annotations

import dataclasses
import json
import re
import tomllib
from pathlib import Path

import yaml

from . import diagrams, environments, trestle
from .compat import Model, _check_element, load_model
from .compat import resolve as resolve_claims
from .scriptmeta import discover

ENVS = Path("envs")
RECIPE = "env.toml"
PLAN = "plan.json"
FRAGMENTS = Path("architecture/model/deployment/generated")
FACTS = ENVS / "environments.generated.json"

PLAN_FORMAT = "trestle-plan"
PLAN_VERSION = 1
FACTS_VERSION = 1

# Roles whose providers store data rather than serve it.
_DATASTORE_ROLES = {"relational_db", "object_store"}
_CLIENTS = "@clients"
# Trestle edge kind → (LikeC4 relationship, title) for the kinds that keep a fixed title.
_VIA = {"authenticates": "authenticates via", "authorizes": "authorizes via"}


def names(root: Path) -> list[str]:
    """Every generated environment: the folders under ``envs/`` with a recipe."""
    return sorted(p.parent.name for p in (root / ENVS).glob(f"*/{RECIPE}"))


def load_plan(root: Path, name: str) -> dict:
    path = ENVS / name / PLAN
    try:
        plan = json.loads((root / path).read_text())
    except OSError:
        raise ValueError(f"{path} is missing; run `just env-render {name}`") from None
    if plan.get("format") != PLAN_FORMAT:
        raise ValueError(f"{path}: format {plan.get('format')!r} is not {PLAN_FORMAT}")
    if plan.get("version") != PLAN_VERSION:
        raise ValueError(f"{path}: unsupported version {plan.get('version')!r}")
    for key in ("generator", "catalog", "graph", "services", "gateway", "client"):
        if not isinstance(plan.get(key), dict):
            raise ValueError(f"{path}: {key} is missing")
    return plan


def ident(value: str) -> str:
    """A LikeC4 identifier for a Trestle id: ``unity-catalog`` → ``unityCatalog``."""
    words = [w for w in re.split(r"[^A-Za-z0-9]+", value) if w]
    if not words:
        raise ValueError(f"'{value}' has no identifier characters")
    out = (
        words[0][0].lower()
        + words[0][1:]
        + "".join(w[0].upper() + w[1:] for w in words[1:])
    )
    return out if out[0].isalpha() else f"n{out}"


def _q(text: str) -> str:
    return json.dumps(text, ensure_ascii=False)


# --- projections --------------------------------------------------------------


def _uses_kind(model: Model, roles: trestle.RoleMap, role: str) -> str:
    """``consumes`` toward a capability some spec specifies (S3), else ``dependsOn``."""
    entry = roles.roles.get(roles.canonical(role))
    target = entry.target if entry else None
    if target and any(k == "specifies" and t == target for k, _, t in model.edges):
        return "consumes"
    return "dependsOn"


def _route_title(plan: dict, edge: dict) -> str:
    """``:<listener> <prefix>, …`` for the gateway routes that reach ``edge['to']``."""
    services = {s["name"] for s in plan["services"].get(edge["to"], [])}
    prefixes = [
        route["prefix"]
        for listener in plan["gateway"].get("listeners") or []
        if listener.get("host_port") == edge.get("host_port")
        for route in listener.get("routes") or []
        if route.get("cluster") in services
    ]
    return f":{edge.get('host_port')} {', '.join(prefixes)}".rstrip()


def render_fragment(
    name: str, plan: dict, model: Model, roles: trestle.RoleMap, errors: list[str]
) -> str:
    where = f"{ENVS / name / PLAN}"
    env = ident(name)
    nodes = [n for n in plan["graph"].get("nodes") or [] if n.get("id") != _CLIENTS]
    ids: dict[str, str] = {}
    for node in nodes:
        nid = ident(node["id"])
        if nid in ids.values():
            errors.append(f"{where}: node {node['id']} escapes to a taken id '{nid}'")
        ids[node["id"]] = nid

    lines = [
        f"// Generated by `docsnip envs --fix` from {ENVS / name / PLAN}. Don't edit:",
        f"// change {ENVS / name / RECIPE} and run `just env-render {name}`.",
        "",
        "deployment {",
        "",
        f"  environment {env} {_q(f'{name} (generated)')} {{",
        "    #generated",
    ]
    for node in nodes:
        ref = node.get("model")
        if ref is None:
            errors.append(f"{where}: node {node['id']} has no model ref")
        else:
            _check_element(
                model,
                ref,
                {"implementation"},
                "model ref",
                f"{where}: node {node['id']}",
                errors,
            )
        containers = [
            s["name"]
            for s in plan["services"].get(node["id"], [])
            if (s.get("placement") or {}).get("kind") == "container"
        ]
        kind = "datastore" if node.get("role") in _DATASTORE_ROLES else "service"
        title = ", ".join(containers) or node.get("display_name") or node["id"]
        lines += [
            "",
            f"    {ids[node['id']]} = {kind} {_q(title)} {{",
            "      #generated",
        ]
        if node.get("summary"):
            lines.append(f"      description {_q(node['summary'])}")
        lines.append(f"      metadata {{ trestleModule {_q(node['id'])} }}")
        if ref is not None:
            lines.append(f"      instanceOf {ref}")
        lines.append("    }")

    edges = []
    for edge in plan["graph"].get("edges") or []:
        kind = edge.get("kind")
        if kind == "access":
            continue  # clients are implicit
        source, target = ids.get(edge.get("from")), ids.get(edge.get("to"))
        if source is None or target is None:
            errors.append(f"{where}: edge {edge.get('key')} names an unknown node")
            continue
        if kind == "route":
            rel, title = "flows", _route_title(plan, edge)
        elif kind == "uses":
            rel = _uses_kind(model, roles, str(edge.get("role")))
            title = str(edge.get("protocol") or edge.get("role"))
        elif kind in _VIA:
            rel, title = "dependsOn", _VIA[kind]
        else:
            errors.append(f"{where}: edge {edge.get('key')} has unknown kind {kind!r}")
            continue
        edges.append((source, rel, target, title, str(edge.get("key"))))
    if edges:
        lines.append("")
    for source, rel, target, title, key in edges:
        lines += [
            f"    {env}.{source} -[{rel}]-> {env}.{target} {_q(title)} {{",
            f"      metadata {{ trestleEdge {_q(key)} }}",
            "    }",
        ]
    lines += [
        "  }",
        "}",
        "",
        "views {",
        "",
        f"  deployment view {env}Deploy {{",
        f"    title {_q(f'Deployment — {name} (generated)')}",
        f"    description {_q(f'Rendered by Trestle from envs/{name}/env.toml.')}",
        "",
        f"    include {env}.**",
        "    autoLayout LeftRight",
        "  }",
        "}",
        "",
    ]
    return "\n".join(lines)


def build_contexts(root: Path, name: str) -> list[str]:
    """The ``build`` knobs in a recipe: folders under ``envs/<name>/`` an image is built from."""
    recipe = tomllib.loads((root / ENVS / name / RECIPE).read_text())
    overrides = (recipe.get("selection") or {}).get("knob_overrides") or {}
    return sorted(
        {
            str(knobs["build"]).strip("/")
            for knobs in overrides.values()
            if isinstance(knobs, dict) and knobs.get("build")
        }
    )


def runtime_files(root: Path, name: str, plan: dict) -> list[str]:
    """What a reader needs to start the environment, relative to ``envs/<name>/``:
    the files the plan says it rendered, and every build context's files."""
    where = ENVS / name
    files = {str(f["path"]) for f in plan.get("files") or []}
    for context in build_contexts(root, name):
        folder = root / where / context
        if not folder.is_dir():
            raise ValueError(f"{where / RECIPE}: build context {context}/ is missing")
        files |= {
            p.relative_to(root / where).as_posix()
            for p in folder.rglob("*")
            if p.is_file()
        }
    return sorted(files - {RECIPE, PLAN})


def services(plan: dict) -> list[dict[str, object]]:
    """Each graph node a reader runs, with its model element and, when the
    gateway routes to it, the host URL of its first route."""
    module_of = {
        str(svc["name"]): module
        for module, instances in (plan.get("services") or {}).items()
        for svc in instances
    }
    urls: dict[str, str] = {}
    for listener in plan["gateway"].get("listeners") or []:
        if "host_port" not in listener:
            continue
        for route in listener.get("routes") or []:
            module = module_of.get(str(route.get("cluster")))
            if module and module not in urls:
                prefix = str(route.get("prefix") or "").rstrip("/")
                urls[module] = f"http://localhost:{listener['host_port']}{prefix}"
    return [
        {
            "node": node["id"],
            "element": node.get("model"),
            "role": node.get("role"),
            "url": urls.get(node["id"]),
        }
        for node in sorted(plan["graph"]["nodes"], key=lambda n: n["id"])
        if node.get("kind") != "clients"
    ]


def facts(plan: dict, files: list[str] | None = None) -> dict[str, object]:
    """The registry facts a plan settles: host ports, the host client env, the
    services a reader runs, and the bundle's runtime files."""
    ports = sorted(
        {
            int(listener["host_port"])
            for listener in plan["gateway"].get("listeners") or []
            if "host_port" in listener
        }
    )
    return {
        "ports": ports,
        "client-env": dict(sorted((plan["client"].get("host") or {}).items())),
        "services": services(plan),
        "files": files or [],
    }


def render_facts(plans: dict[str, dict], files: dict[str, list[str]]) -> str:
    body = {
        "version": FACTS_VERSION,
        "environments": {
            name: facts(plan, files.get(name)) for name, plan in sorted(plans.items())
        },
    }
    return json.dumps(body, indent=2, ensure_ascii=False) + "\n"


def project(root: Path) -> tuple[dict[Path, str], list[str]]:
    """Every projected file (repo-relative path → contents) and the errors found."""
    errors: list[str] = []
    plans: dict[str, dict] = {}
    try:
        pin = trestle.load_pin(root)
        catalog = trestle.load_catalog(root)
        roles = trestle.load_map(root)
    except (OSError, ValueError) as exc:
        return {}, [str(exc)]
    for name in names(root):
        try:
            plan = load_plan(root, name)
        except ValueError as exc:
            errors.append(str(exc))
            continue
        where = ENVS / name / PLAN
        revision = plan["generator"].get("revision")
        if revision != pin.rev:
            errors.append(
                f"{where}: rendered by Trestle {revision}, but {trestle.PIN} pins "
                f"{pin.rev}; run `just env-render {name}`"
            )
        if plan["catalog"].get("digest") != catalog.digest:
            errors.append(
                f"{where}: planned against catalog {plan['catalog'].get('digest')}, but "
                f"{trestle.CATALOG} is {catalog.digest}; run `just env-render {name}`"
            )
        plans[name] = plan
    model = load_model(root)
    out: dict[Path, str] = {}
    files: dict[str, list[str]] = {}
    for name, plan in plans.items():
        out[FRAGMENTS / f"{name}.likec4"] = render_fragment(
            name, plan, model, roles, errors
        )
        try:
            files[name] = runtime_files(root, name, plan)
        except ValueError as exc:
            errors.append(str(exc))
    if plans or (root / FACTS).is_file():
        out[FACTS] = render_facts(plans, files)
    titles = registry_titles(root)
    for name, plan in plans.items():
        out[diagrams.env_snapshot_path(name)] = diagrams.render_env_snapshot(
            plan, titles.get(name)
        )
    return out, errors


def registry_titles(root: Path) -> dict[str, str]:
    """Generated environment → the title its registry entry gives it. Read raw:
    the registry's derived facts may be the very projection being rewritten."""
    path = root / environments.REGISTRY
    if not path.is_file():
        return {}
    raw = yaml.safe_load(path.read_text()) or {}
    return {
        str(entry["generated"]): str(entry["title"])
        for entry in (raw.get("environments") or {}).values()
        if isinstance(entry, dict) and entry.get("generated") and entry.get("title")
    }


def _stale(root: Path, files: dict[Path, str]) -> list[Path]:
    """Projected files whose contents differ, and fragments no environment renders."""
    stale = [
        p
        for p, text in files.items()
        if not (root / p).is_file() or (root / p).read_text() != text
    ]
    stale += [
        p.relative_to(root)
        for p in sorted((root / FRAGMENTS).glob("*.likec4"))
        if p.relative_to(root) not in files
    ]
    return stale


def check(root: Path) -> list[str]:
    """Errors: a malformed or stale plan, a stale projection, a registry mismatch."""
    if not names(root) and not (root / FRAGMENTS).is_dir():
        return []
    files, errors = project(root)
    if errors:
        return errors
    errors += [
        f"{p} is stale; run `uv run docsnip envs --fix`" for p in _stale(root, files)
    ]
    try:
        registry = environments.load(root)
    except (OSError, ValueError) as exc:
        return [*errors, str(exc)]
    declared = {env.generated for env in registry.values() if env.generated}
    for name in names(root):
        if name not in declared:
            errors.append(
                f"{ENVS / name}: no {environments.REGISTRY} entry says `generated: {name}`"
            )
    return errors


def fix(root: Path) -> list[Path]:
    """Rewrite the projections; the changed paths. Raises ``ValueError`` on errors."""
    files, errors = project(root)
    if errors:
        raise ValueError("\n".join(errors))
    changed = []
    for path in _stale(root, files):
        target = root / path
        if path in files:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(files[path])
        else:
            target.unlink()
        changed.append(path)
    return changed


# --- environment fit ------------------------------------------------------------


@dataclasses.dataclass
class Fit:
    errors: list[str]
    reports: list[str]


def implementations(plan: dict) -> set[str]:
    return {n["model"] for n in plan["graph"].get("nodes") or [] if n.get("model")}


def _provides(model: Model, impl: str, edge: str, element: str) -> bool:
    if edge == "realizes":
        return bool(trestle.backing(model, impl, element))
    return (edge, impl, element) in model.edges


def fit(root: Path) -> Fit:
    """Each working claim's provider requirements (``requires`` other than the
    client) must be met by an implementation its environment runs.

    Only generated environments know what they run."""
    report = Fit([], [])
    if not names(root):
        return report
    try:
        registry = environments.load(root)
        plans = {name: load_plan(root, name) for name in names(root)}
    except (OSError, ValueError):
        return report  # reported by check()
    against: dict[str, list[str]] = {}
    for key, env in registry.items():
        if env.generated in plans:
            against.setdefault(key, []).append(env.generated)
    if not against:
        return report

    content = root / "content"
    env_of = {
        m.path.resolve().relative_to(root.resolve()).as_posix(): environments.key_for(
            compose, root
        )
        for m in discover(content)
        if (compose := m.compose_path()) is not None
    }
    result = resolve_claims(root)
    model = result.model
    seen: set[tuple[str, ...]] = set()
    for (project, iface, jid), proofs in sorted(result.proofs.items()):
        journey = result.matrices[project].journeys[jid]
        providers = {r: reqs for r, reqs in journey.requires.items() if r != "client"}
        for proof in proofs:
            key = env_of.get(proof.script)
            if not proof.claim.works or key is None:
                continue  # negative evidence, or an in-process participant
            for name in against.get(key, []):
                runs = implementations(plans[name])
                for role, reqs in sorted(providers.items()):
                    for edge, elements in sorted(reqs.items()):
                        for element in elements:
                            found = sorted(
                                i for i in runs if _provides(model, i, edge, element)
                            )
                            mark = (
                                name,
                                project,
                                jid,
                                role,
                                edge,
                                element,
                                str(len(found) > 1),
                            )
                            if (len(found) == 1) or mark in seen:
                                continue
                            seen.add(mark)
                            where = f"{proof.script}: {iface} {jid} on {name}"
                            if not found:
                                report.errors.append(
                                    f"{where}: no implementation in the environment "
                                    f"{edge} {element} (the journey's {role})"
                                )
                            else:
                                report.reports.append(
                                    f"  - envs: {where}: {role} {edge} {element} is "
                                    f"ambiguous ({', '.join(found)})"
                                )
    return report

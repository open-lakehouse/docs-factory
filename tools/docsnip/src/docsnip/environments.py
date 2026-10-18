"""The ``envs/environments.yml`` registry: reader-facing facts per compose file.

A script's ``[tool.docs-factory] compose`` says *which* stack it needs; the
registry says what that stack is to a reader (title, host ports, the client
variables to export). Keys are compose paths relative to ``envs/``, so the
same key names a file in the repo and in the published environment bundle.
"""

from __future__ import annotations

import dataclasses
import json
import re
from pathlib import Path

import yaml

REGISTRY = Path("envs") / "environments.yml"
# Facts `docsnip envs --fix` derives from a generated environment's plan.json.
GENERATED = Path("envs") / "environments.generated.json"

# Mirrors DECLARED_RE in site/src/content-core/environment.mjs.
_BOX_RE = re.compile(r"^:{3,}prerequisites\b(?:\{([^}\n]*)\})?", re.MULTILINE)
_DECLARED_RE = re.compile(r'\benvironment="([^"]+)"')
_MARKER_RE = re.compile(r"^:{3,}environment\s*$", re.MULTILINE)
_KEYED_RE = re.compile(r'^:{3,}environment\{key="([^"]+)"\}\s*$', re.MULTILINE)
# The emitter checks that the page exists; see environmentGuide in environment.mjs.
_GUIDE_RE = re.compile(r"[a-z-]+/[a-z0-9-]+(#[a-z0-9-]+)?")


@dataclasses.dataclass(frozen=True)
class Environment:
    key: str
    title: str
    ports: list[int]
    client_env: dict[str, str]
    guide: str | None = None
    generated: str | None = (
        None  # the envs/<name>/ whose plan.json settles ports and env
    )


def _generated_facts(repo_root: Path) -> dict[str, dict]:
    path = repo_root / GENERATED
    if not path.is_file():
        return {}
    return json.loads(path.read_text()).get("environments") or {}


def load(repo_root: Path) -> dict[str, Environment]:
    """Registry entries by key. Raises ``ValueError`` on a malformed entry."""
    raw = yaml.safe_load((repo_root / REGISTRY).read_text()) or {}
    derived = _generated_facts(repo_root)
    envs: dict[str, Environment] = {}
    for key, entry in (raw.get("environments") or {}).items():
        entry = entry or {}
        title = entry.get("title")
        generated = entry.get("generated")
        if generated is not None:
            if {"ports", "client-env", "services", "files", "deploy"} & entry.keys():
                raise ValueError(
                    f"{REGISTRY}: {key}: a generated entry takes ports, client-env, "
                    f"services, files, and deploy from {GENERATED}"
                )
            if generated not in derived:
                raise ValueError(
                    f"{REGISTRY}: {key}: {GENERATED} has no '{generated}'; "
                    "run `uv run docsnip envs --fix`"
                )
            entry = {**entry, **derived[generated]}
        ports = entry.get("ports", []) or []
        client_env = entry.get("client-env", {}) or {}
        guide = entry.get("guide")
        if not isinstance(title, str) or not title:
            raise ValueError(f"{REGISTRY}: {key}: title must be a non-empty string")
        if not all(isinstance(p, int) for p in ports):
            raise ValueError(f"{REGISTRY}: {key}: ports must be integers")
        if not all(isinstance(v, str) for v in client_env.values()):
            raise ValueError(f"{REGISTRY}: {key}: client-env values must be strings")
        if guide is not None and not (
            isinstance(guide, str) and _GUIDE_RE.fullmatch(guide)
        ):
            raise ValueError(
                f"{REGISTRY}: {key}: guide must be <bucket>/<slug>[#anchor]"
            )
        envs[key] = Environment(
            key, title, list(ports), dict(client_env), guide, generated
        )
    return envs


def key_for(compose_path: Path, repo_root: Path) -> str | None:
    """The registry key for an absolute compose path, or None if outside ``envs/``."""
    try:
        return compose_path.relative_to((repo_root / "envs").resolve()).as_posix()
    except ValueError:
        return None


def client_env(compose_path: Path | None, repo_root: Path) -> dict[str, str]:
    """The variables a host-side client of this compose needs (empty if none)."""
    if compose_path is None:
        return {}
    key = key_for(compose_path, repo_root)
    env = load(repo_root).get(key) if key else None
    return dict(env.client_env) if env else {}


def check(repo_root: Path, scripts) -> list[str]:
    """Registry errors: a malformed entry, a key with no file, or a script whose
    compose isn't registered (it would get no start commands)."""
    try:
        envs = load(repo_root)
    except (OSError, ValueError, yaml.YAMLError) as exc:
        return [str(exc)]
    errors = [
        f"{REGISTRY}: {key} names a missing compose file"
        for key in envs
        if not (repo_root / "envs" / key).is_file()
    ]
    for meta in scripts:
        compose = meta.compose_path()
        if compose is None:
            continue
        key = key_for(compose, repo_root)
        if key not in envs:
            errors.append(
                f"{meta.path}: [tool.docs-factory].compose {meta.docs_factory.compose} "
                f"has no entry in {REGISTRY}"
            )
    return errors


def check_pages(repo_root: Path, content_root: Path, scripts) -> list[str]:
    """Prerequisites errors: a page whose scripts need a stack must hold exactly
    one ``:::prerequisites`` (the emitter adds the Docker bullet there), a
    declared ``environment="…"`` must be a registry key, a ``:::environment``
    marker (where the emitter puts the start commands) needs a stack to start,
    and a keyed ``:::environment{key="…"}`` must name a registry key."""
    from .frontmatter import iter_content_files

    try:
        envs = load(repo_root)
    except (OSError, ValueError, yaml.YAMLError):
        return []  # reported by check()
    errors: list[str] = []
    for md in iter_content_files(content_root):
        text = md.read_text()
        boxes = list(_BOX_RE.finditer(text))
        needs = md.name == "index.md" and any(
            m.compose_path() is not None and md.parent in m.path.parents
            for m in scripts
        )
        if len(boxes) > 1:
            errors.append(f"{md}: more than one :::prerequisites")
        elif needs and not boxes:
            errors.append(
                f"{md}: its scripts need a local environment, so the page needs a "
                ":::prerequisites box for the emitter to add the Docker bullet to"
            )
        declares = False
        for box in boxes:
            declared = _DECLARED_RE.search(box.group(1) or "")
            declares = declares or declared is not None
            if declared and declared.group(1) not in envs:
                errors.append(
                    f"{md}: :::prerequisites environment {declared.group(1)} "
                    f"has no entry in {REGISTRY}"
                )
        errors.extend(
            f"{md}: :::environment key {key} has no entry in {REGISTRY}"
            for key in _KEYED_RE.findall(text)
            if key not in envs
        )
        markers = len(_MARKER_RE.findall(text))
        if markers > 1:
            errors.append(f"{md}: more than one :::environment")
        elif markers and not (needs or declares):
            errors.append(
                f"{md}: :::environment marks where the start commands go, but no "
                "script on the page needs a stack and its :::prerequisites declares none"
            )
    return errors

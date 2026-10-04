"""The ``envs/environments.yml`` registry: reader-facing facts per compose file.

A script's ``[tool.docs-factory] compose`` says *which* stack it needs; the
registry says what that stack is to a reader (title, host ports, the client
variables to export). Keys are compose paths relative to ``envs/``, so the
same key names a file in the repo and in the published environment bundle.
"""

from __future__ import annotations

import dataclasses
from pathlib import Path

import yaml

REGISTRY = Path("envs") / "environments.yml"


@dataclasses.dataclass(frozen=True)
class Environment:
    key: str
    title: str
    ports: list[int]
    client_env: dict[str, str]


def load(repo_root: Path) -> dict[str, Environment]:
    """Registry entries by key. Raises ``ValueError`` on a malformed entry."""
    raw = yaml.safe_load((repo_root / REGISTRY).read_text()) or {}
    envs: dict[str, Environment] = {}
    for key, entry in (raw.get("environments") or {}).items():
        entry = entry or {}
        title = entry.get("title")
        ports = entry.get("ports", []) or []
        client_env = entry.get("client-env", {}) or {}
        if not isinstance(title, str) or not title:
            raise ValueError(f"{REGISTRY}: {key}: title must be a non-empty string")
        if not all(isinstance(p, int) for p in ports):
            raise ValueError(f"{REGISTRY}: {key}: ports must be integers")
        if not all(isinstance(v, str) for v in client_env.values()):
            raise ValueError(f"{REGISTRY}: {key}: client-env values must be strings")
        envs[key] = Environment(key, title, list(ports), dict(client_env))
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
    compose isn't registered (it would get no "Start the environment" block)."""
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

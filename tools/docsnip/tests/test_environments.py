"""`envs/environments.yml`: the reader-facing registry of compose files."""

from __future__ import annotations

from pathlib import Path

from docsnip import environments
from docsnip.scriptmeta import discover, parse_script


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _repo(tmp_path: Path, registry: str) -> Path:
    (tmp_path / "envs" / "uc").mkdir(parents=True)
    (tmp_path / "envs" / "uc" / "compose.yaml").write_text("services: {}\n")
    (tmp_path / "envs" / "environments.yml").write_text(registry)
    return tmp_path


def _script(root: Path, compose: str) -> Path:
    path = root / "content" / "p" / "how-to" / "x" / "s.py"
    path.parent.mkdir(parents=True)
    path.write_text(
        f'# /// script\n# [tool.docs-factory]\n# compose = "{compose}"\n# ///\n'
    )
    return path


def test_repo_registry_covers_every_script() -> None:
    root = _repo_root()
    assert environments.check(root, discover(root / "content")) == []


def test_aws_client_env_comes_from_the_registry() -> None:
    root = _repo_root()
    compose = (root / "envs" / "unitycatalog" / "compose.aws.yaml").resolve()
    assert environments.client_env(compose, root) == {
        "AWS_ENDPOINT_URL": "http://localhost:9000",
        "AWS_ALLOW_HTTP": "true",
    }
    assert environments.client_env(None, root) == {}


def test_unregistered_compose_is_an_error(tmp_path) -> None:
    root = _repo(tmp_path, "environments: {}\n")
    meta = parse_script(_script(root, "../../../../envs/uc/compose.yaml"))
    errors = environments.check(root, [meta])
    assert len(errors) == 1 and "has no entry" in errors[0]


def test_registry_key_without_file_is_an_error(tmp_path) -> None:
    root = _repo(tmp_path, "environments:\n  uc/gone.yaml: { title: Gone }\n")
    assert environments.check(root, []) == [
        "envs/environments.yml: uc/gone.yaml names a missing compose file"
    ]

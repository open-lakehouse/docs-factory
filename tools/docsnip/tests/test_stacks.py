"""`docsnip stack`: the one docs environment up on a machine."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest
from docsnip import stacks


def _compose_ls(monkeypatch: pytest.MonkeyPatch, entries: list[dict]) -> None:
    def fake_run(cmd, **kwargs):
        assert cmd[:3] == ["docker", "compose", "ls"]
        return subprocess.CompletedProcess(
            cmd, 0, stdout=json.dumps(entries), stderr=""
        )

    monkeypatch.setattr(stacks.subprocess, "run", fake_run)


def test_running_keeps_only_docs_environments(monkeypatch: pytest.MonkeyPatch):
    _compose_ls(
        monkeypatch,
        [
            {
                "Name": "uc-docs",
                "Status": "running(1)",
                "ConfigFiles": "/a/docs-factory/envs/unitycatalog/compose.yaml",
            },
            {
                "Name": "server",
                "Status": "running(1)",
                "ConfigFiles": "/a/docs-factory/server/docker-compose.yml",
            },
        ],
    )
    [stack] = stacks.running()
    assert stack.project == "uc-docs"
    assert stack.env == "unitycatalog"
    assert stack.compose == Path("/a/docs-factory/envs/unitycatalog/compose.yaml")


def test_running_is_empty_without_docker(monkeypatch: pytest.MonkeyPatch):
    def no_docker(cmd, **kwargs):
        raise FileNotFoundError("docker")

    monkeypatch.setattr(stacks.subprocess, "run", no_docker)
    assert stacks.running() == []


def test_busy_message_names_the_stack_and_the_way_out():
    stack = stacks.Stack("uc-docs", "running(1)", Path("/b/envs/uc-aws/compose.yaml"))
    message = stacks.busy_message([stack])
    assert "uc-aws" in message
    assert "/b/envs/uc-aws/compose.yaml" in message
    assert "just env-down" in message


def test_up_refuses_an_unknown_environment(tmp_path: Path):
    (tmp_path / "envs" / "uc").mkdir(parents=True)
    (tmp_path / "envs" / "uc" / "compose.yaml").write_text("services: {}\n")
    with pytest.raises(SystemExit, match="one of: uc"):
        stacks.up(tmp_path, "nope")

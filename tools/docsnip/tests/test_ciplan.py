"""`docsnip plan`: per-lane script selection and duration-balanced shards."""

from __future__ import annotations

import json

from docsnip import ciplan
from docsnip.scriptmeta import parse_script


def _script(repo, rel: str, table: str = ""):
    path = repo / "content" / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    (path.parent.parent / "index.md").write_text("---\ntitle: x\n---\n")
    path.write_text(
        "# /// script\n# dependencies = []\n"
        + (f"#\n# [tool.docs-factory]\n{table}" if table else "")
        + "# ///\n"
    )
    if "compose" in table:
        (path.parent / "compose.yaml").write_text("services: {}\n")
    return parse_script(path)


def _repo(tmp_path):
    return [
        _script(tmp_path, "delta/how-to/001-read/snippets/read.py"),
        _script(
            tmp_path,
            "delta/how-to/001-read/snippets/read_pyspark.py",
            '# lane = "spark"\n',
        ),
        _script(tmp_path, "delta/how-to/002-write/snippets/write.py"),
        _script(
            tmp_path,
            "unitycatalog/how-to/001-tables/snippets/tables.py",
            '# compose = "compose.yaml"\n',
        ),
    ]


def _selected(tmp_path, changed):
    return {m.path.name for m in ciplan.select(_repo(tmp_path), tmp_path, changed)}


def test_no_change_set_selects_everything(tmp_path) -> None:
    assert len(_selected(tmp_path, None)) == 4


def test_a_page_change_selects_that_pages_scripts(tmp_path) -> None:
    changed = ["content/delta/how-to/001-read/index.md"]
    assert _selected(tmp_path, changed) == {"read.py", "read_pyspark.py"}


def test_a_release_change_selects_its_project(tmp_path) -> None:
    changed = ["content/delta/release.yml"]
    assert _selected(tmp_path, changed) == {"read.py", "read_pyspark.py", "write.py"}


def test_an_envs_change_selects_service_scripts(tmp_path) -> None:
    assert _selected(tmp_path, ["envs/unitycatalog/compose.yaml"]) == {"tables.py"}


def test_a_harness_change_selects_everything(tmp_path) -> None:
    assert len(_selected(tmp_path, ["content/conftest.py"])) == 4


def test_an_unrelated_change_selects_nothing(tmp_path) -> None:
    assert _selected(tmp_path, ["site/src/main.tsx"]) == set()


def test_plan_groups_by_lane_and_leaves_empty_lanes_empty(tmp_path) -> None:
    plan = ciplan.plan(
        _repo(tmp_path), tmp_path, ["content/delta/how-to/001-read/x.md"]
    )
    assert plan["services"] == []
    assert [(s["id"], s["shard"]) for s in plan["spark"]] == [("spark-1", "1/1")]
    assert plan["default"][0]["scripts"] == [
        "content/delta/how-to/001-read/snippets/read.py"
    ]


def test_shards_balance_by_duration() -> None:
    durations = {"a": 200, "b": 100, "c": 90, "d": 20}
    assert ciplan.shard(list(durations), durations, max_shards=2) == [
        ["a"],
        ["b", "c", "d"],
    ]


def test_shard_count_follows_total_duration_up_to_the_cap() -> None:
    paths = [f"s{i}" for i in range(10)]
    assert len(ciplan.shard(paths, {}, max_shards=4)) == 3  # 300s / 120s
    assert len(ciplan.shard(paths, {}, max_shards=2)) == 2
    assert ciplan.shard([], {}, max_shards=4) == []


def test_merge_keeps_old_values_and_drops_deleted_scripts(tmp_path) -> None:
    (tmp_path / "a.py").write_text("")
    (tmp_path / "b.py").write_text("")
    (tmp_path / ".github").mkdir()
    (tmp_path / ciplan.DURATIONS_FILE).write_text(
        json.dumps({"a.py": 10, "b.py": 20, "gone.py": 5})
    )
    recorded = tmp_path / "shard.json"
    recorded.write_text(json.dumps({"a.py": 12.4}))
    assert ciplan.merge_durations(tmp_path, [recorded]) == {"a.py": 12, "b.py": 20}

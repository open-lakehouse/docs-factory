"""`content/<project>/release.yml`: one release per project, pinned consistently."""

from __future__ import annotations

from pathlib import Path

from docsnip import versions

MANIFEST = """\
release: 0.6.0
pins:
  unitycatalog-client: 0.6.0
  unitycatalog-ai: 0.4.0
  delta-spark: 4.3.1
  pyspark: 4.1.0
  iceberg: 1.11.0
"""


DELTA_MANIFEST = """\
release: 4.4.0
pins:
  pyspark: 4.2.0
  deltalake: 1.6.6
  deltalake-rs: 1.1.1
  duckdb: 1.5.6
"""


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _repo(
    tmp_path: Path,
    pages: dict[str, str],
    project: str = "unitycatalog",
    manifest: str | None = MANIFEST,
) -> Path:
    root = tmp_path / "content" / project
    root.mkdir(parents=True)
    if manifest is not None:
        (root / "release.yml").write_text(manifest)
    for rel, text in pages.items():
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
    return tmp_path


def test_repo_pins_match_the_manifest() -> None:
    assert versions.check(_repo_root()) == []


def test_repo_prose_names_no_release() -> None:
    assert versions.prose_warnings(_repo_root()) == []


def test_mismatched_pin_is_an_error(tmp_path: Path) -> None:
    repo = _repo(
        tmp_path,
        {
            "tutorials/t/index.md": "```bash\nuv run --with unitycatalog-client==0.5.0 python\n```\n"
        },
    )
    [error] = versions.check(repo)
    assert "tutorials/t/index.md:2" in error and "should be 0.6.0" in error


def test_ranged_install_in_a_page_is_an_error(tmp_path: Path) -> None:
    repo = _repo(
        tmp_path,
        {
            "tutorials/t/index.md": "```bash\nuv run --with unitycatalog-client>=0.6.0 python\n```\n"
        },
    )
    [error] = versions.check(repo)
    assert "exactly (==)" in error


def test_iceberg_runtime_follows_the_iceberg_pin(tmp_path: Path) -> None:
    repo = _repo(
        tmp_path,
        {
            "how-to/h/snippets/s.py": (
                'ICEBERG = "org.apache.iceberg:iceberg-spark-runtime-4.1_2.13:1.10.0"\n'
                'AWS = "org.apache.iceberg:iceberg-aws-bundle:1.11.0"\n'
            )
        },
    )
    [error] = versions.check(repo)
    assert "s.py:1" in error and "should be 1.11.0" in error


def test_a_second_spark_line_follows_its_own_pins(tmp_path: Path) -> None:
    manifest = MANIFEST + "  pyspark-4.2: 4.2.0\n  delta-spark-4.2: 4.4.1\n"
    page = (
        '# dependencies = ["pyspark==4.2.0"]\n'
        'DELTA = "io.delta:delta-spark_4.2_2.13:4.4.0"\n'
        '# dependencies = ["pyspark==4.1.0"]\n'
        'DELTA = "io.delta:delta-spark_4.1_2.13:4.3.1"\n'
    )
    repo = _repo(tmp_path, {"how-to/h/snippets/s.py": page}, manifest=manifest)
    [error] = versions.check(repo)
    assert (
        "s.py:2" in error and "should be 4.4.1" in error and "delta-spark-4.2" in error
    )
    versions.fix(repo)
    fixed = (repo / "content/unitycatalog/how-to/h/snippets/s.py").read_text()
    assert (
        "delta-spark_4.2_2.13:4.4.1" in fixed and "delta-spark_4.1_2.13:4.3.1" in fixed
    )
    assert versions.check(repo) == []


def test_mlflow_pins_follow_their_keys(tmp_path: Path) -> None:
    manifest = MANIFEST + ("  mlflow: 3.17.0\n  scikit-learn: 1.9.1\n")
    pages = {
        # Extras and `pip_requirements` follow `mlflow`; so does the image tag.
        "tutorials/t/snippets/s.py": (
            '# dependencies = ["mlflow[databricks]==3.10.0", "scikit-learn==1.8.0"]\n'
            'REQS = ["mlflow==3.17.0"]\n'
            'IMAGE = "ghcr.io/mlflow/mlflow:v3.16.0-full"\n'
        ),
        # Extras on a CLI install follow `mlflow` too.
        "how-to/017-langchain-tools/snippets/g.sh": (
            'uv run --with "mlflow[gateway]==3.10.0" mlflow gateway start\n'
            "uv run --with mlflow==3.17.0 python\n"
        ),
    }
    repo = _repo(tmp_path, pages, manifest=manifest)
    errors = versions.check(repo)
    assert len(errors) == 4, errors
    assert any("s.py:1" in e and "should be 3.17.0 (" in e for e in errors)
    assert any("s.py:1" in e and "should be 1.9.1" in e for e in errors)
    assert any("s.py:3" in e and "mlflow:v3.16.0" in e for e in errors)
    assert any("g.sh:1" in e and "should be 3.17.0 (" in e for e in errors)
    versions.fix(repo)
    assert versions.check(repo) == []
    image = (repo / "content/unitycatalog/tutorials/t/snippets/s.py").read_text()
    assert "ghcr.io/mlflow/mlflow:v3.17.0-full" in image
    gateway = (
        repo / "content/unitycatalog/how-to/017-langchain-tools/snippets/g.sh"
    ).read_text()
    assert gateway.count("==3.17.0") == 2


def test_ranged_mlflow_install_in_a_page_is_an_error(tmp_path: Path) -> None:
    page = "```bash\nuv run --with 'mlflow[databricks]>=3.17' python\n```\n"
    repo = _repo(tmp_path, {"tutorials/t/index.md": page})
    [error] = versions.check(repo)
    assert "exactly (==)" in error


def test_script_lower_bound_is_allowed(tmp_path: Path) -> None:
    repo = _repo(tmp_path, {"how-to/h/seed.py": '#   "unitycatalog-client>=0.5",\n'})
    assert versions.check(repo) == []


def test_bump_rewrites_pins_but_not_reference_facts(tmp_path: Path) -> None:
    repo = _repo(
        tmp_path,
        {
            "how-to/h/index.md": (
                "- Python with `unitycatalog-client` 0.6.0.\n"
                "See [the source](https://github.com/unitycatalog/unitycatalog/blob/v0.6.0/x).\n"
                "`io.unitycatalog:unitycatalog-spark_4.1_2.13:0.6.0`\n"
            ),
            "reference/r/index.md": (
                "This page lists what release **0.6.0** implements, from the\n"
                "[`v0.6.0` source tree](https://github.com/unitycatalog/unitycatalog/tree/v0.6.0).\n"
                "| `unitycatalog-ai` 0.4.0 | falsy results |\n"
            ),
        },
    )
    versions.bump(repo, "0.7.0")
    loaded = versions.load(repo)
    assert loaded["release"] == "0.7.0"
    assert loaded["unitycatalog-client"] == "0.7.0"  # tracked the release
    assert loaded["unitycatalog-ai"] == "0.4.0"  # versions independently
    page = (repo / "content/unitycatalog/how-to/h/index.md").read_text()
    assert "0.6.0" not in page and page.count("0.7.0") == 3
    reference = (repo / "content/unitycatalog/reference/r/index.md").read_text()
    assert "`unitycatalog-ai` 0.4.0" in reference
    assert "0.6.0" not in reference and reference.count("0.7.0") == 3
    assert versions.check(repo) == []


def test_prose_flags_scoping_but_not_boundaries(tmp_path: Path) -> None:
    repo = _repo(
        tmp_path,
        {
            "how-to/h/index.md": (
                "---\ntitle: T\nsummary: Start Unity Catalog 0.6.0.\n---\n"
                "In 0.6.0 the server allows it.\n"
                "Requires 0.6.0 or later.\n"
                "Deprecated since 0.6.0.\n"
                "Python with `unitycatalog-client`\n  0.6.0.\n"
                "| table | 0.6.0 |\n"
                "```bash\necho 0.6.0\n```\n"
            ),
            "reference/features-and-limitations/index.md": "Release 0.6.0.\n",
        },
    )
    warnings = versions.prose_warnings(repo)
    assert [w.split(":")[1] for w in warnings] == ["3", "5"]


def _delta(
    tmp_path: Path, pages: dict[str, str], manifest: str | None = DELTA_MANIFEST
):
    return _repo(tmp_path, pages, project="delta", manifest=manifest)


def test_delta_pins_are_checked_against_their_own_manifest(tmp_path: Path) -> None:
    repo = _delta(
        tmp_path,
        {
            "how-to/h/snippets/read.py": (
                '# dependencies = ["deltalake[pandas]==1.6.6", "duckdb==1.5.4"]\n'
            ),
        },
    )
    [error] = versions.check(repo)
    assert "duckdb==1.5.4 should be 1.5.6" in error and "just bump-delta" in error


def test_a_project_folder_without_its_manifest_is_an_error(tmp_path: Path) -> None:
    repo = _delta(tmp_path, {"how-to/h/index.md": "Hi.\n"}, manifest=None)
    [error] = versions.check(repo)
    assert "content/delta/release.yml" in error


def test_bump_delta_moves_delta_spark_but_not_deltalake(tmp_path: Path) -> None:
    repo = _delta(
        tmp_path,
        {
            "tutorials/t/snippets/spark_sql.sh": (
                "uvx --from pyspark==4.2.0 spark-sql "
                "--packages io.delta:delta-spark_2.13:4.4.0\n"
            ),
            "how-to/h/index.md": ("- `delta-spark` 4.4.0 and `deltalake` 1.6.6.\n"),
        },
    )
    versions.bump(repo, "4.5.0", versions.DELTA)
    loaded = versions.load(repo, versions.DELTA)
    assert loaded["release"] == "4.5.0" and loaded["deltalake"] == "1.6.6"
    script = (repo / "content/delta/tutorials/t/snippets/spark_sql.sh").read_text()
    assert "delta-spark_2.13:4.5.0" in script and "pyspark==4.2.0" in script
    page = (repo / "content/delta/how-to/h/index.md").read_text()
    assert "`delta-spark` 4.5.0" in page and "`deltalake` 1.6.6" in page
    assert versions.check(repo) == []


def test_delta_prose_boundaries_name_the_product(tmp_path: Path) -> None:
    repo = _delta(
        tmp_path,
        {
            "how-to/h/index.md": (
                "In 4.4.0 the writer adds it.\n"
                "Requires Delta Lake 4.4.0 or later.\n"
                "Fixed in Delta 4.4.0.\n"
            ),
        },
    )
    warnings = versions.prose_warnings(repo)
    assert [w.split(":")[1] for w in warnings] == ["1"]

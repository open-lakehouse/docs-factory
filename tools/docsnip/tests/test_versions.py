"""`content/unitycatalog/release.yml`: one release, pinned consistently."""

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


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _repo(tmp_path: Path, pages: dict[str, str]) -> Path:
    root = tmp_path / "content" / "unitycatalog"
    root.mkdir(parents=True)
    (root / "release.yml").write_text(MANIFEST)
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


NEXT = """\
next:
  release: 0.7.0
  pins:
    unitycatalog-chart: 0.1.0
  paths:
    - content/unitycatalog/how-to/deploy/
"""


def _next_repo(tmp_path: Path, pages: dict[str, str]) -> Path:
    repo = _repo(tmp_path, pages)
    manifest = repo / versions.MANIFEST
    manifest.write_text(manifest.read_text() + NEXT)
    return repo


def test_next_paths_pin_the_next_release(tmp_path: Path) -> None:
    image = "image: unitycatalog/unitycatalog:v0.7.0\n"
    chart = "helm install uc oci://ghcr.io/unitycatalog/charts/unitycatalog \\\n  --version 0.1.0\n"
    repo = _next_repo(
        tmp_path,
        {
            "how-to/deploy/snippets/compose.yaml": image,
            "how-to/deploy/snippets/deploy.sh": chart,
            "how-to/other/compose.yaml": image,
        },
    )
    [error] = versions.check(repo)
    assert "how-to/other/compose.yaml:1" in error and "should be 0.6.0" in error


def test_next_page_cannot_be_ready(tmp_path: Path) -> None:
    page = "---\ntitle: T\nstatus: ready\n---\nBody.\n"
    repo = _next_repo(tmp_path, {"how-to/deploy/index.md": page})
    [error] = versions.check(repo)
    assert "keep it a draft" in error


def test_bump_to_next_folds_the_block(tmp_path: Path) -> None:
    repo = _next_repo(
        tmp_path,
        {
            "how-to/deploy/values.yaml": "  tag: v0.7.0\n",
            "how-to/h/compose.yaml": "image: unitycatalog/unitycatalog:v0.6.0\n",
        },
    )
    versions.bump(repo, "0.7.0")
    assert versions.load_next(repo) is None
    loaded = versions.load(repo)
    assert loaded["release"] == "0.7.0" and loaded["unitycatalog-chart"] == "0.1.0"
    assert "v0.7.0" in (repo / "content/unitycatalog/how-to/h/compose.yaml").read_text()
    assert versions.check(repo) == []

"""Cross-language contract test: Python (docsnip) vs the JS content-core.

The JS content-core is the authority for the parsing contract (frontmatter
split, body hashing, path identity), and docsnip must agree with it wherever the
two overlap — otherwise the DB refs the JS manifest registers won't match what
docsnip validates. This builds the JS manifest with `node`, then asserts:

  * every doc/blog docsnip parses hashes to the SAME contentHash the JS manifest
    recorded (frontmatter split + body hashing parity), and
  * docsnip's derived path identity matches the JS manifest's (area/project/
    bucket/slug) — the folder-mode fix must hold on both sides.

Skips (rather than fails) if `node` or the site's node_modules are unavailable,
so a Python-only checkout still runs the rest of the suite; CI has both.
"""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest
from docsnip.frontmatter import iter_content_files, parse


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _hash_body(body: str) -> str:
    return hashlib.sha256(body.replace("\r\n", "\n").encode()).hexdigest()


def _py_doc_identity(rel_path: str, meta: dict) -> tuple[str, str, str]:
    """(project, bucket, slug) the way the JS identity.docIdentity derives them.

    Mirrors normalizeDocPath + stripOrderPrefix + the `slug:` override, so this
    test also guards that docsnip and the site agree on folder-mode identity.
    """
    parts = rel_path.split("/")
    if re.fullmatch(r"index\.mdx?", parts[-1]):
        parts = parts[:-1]
    else:
        parts[-1] = re.sub(r"\.mdx?$", "", parts[-1])
    project, bucket, leaf = parts[-3], parts[-2], parts[-1]
    slug = re.sub(r"^\d+-", "", leaf)
    fm_slug = meta.get("slug")
    if isinstance(fm_slug, str) and fm_slug:
        slug = fm_slug
    return project, bucket, slug


@pytest.fixture(scope="module")
def js_manifest() -> list[dict]:
    root = _repo_root()
    if shutil.which("node") is None or not (root / "site" / "node_modules").is_dir():
        pytest.skip("node or site/node_modules unavailable")
    subprocess.run(
        ["node", "scripts/build-version-manifest.mjs"],
        cwd=root / "site",
        check=True,
        capture_output=True,
    )
    manifest_path = root / "site" / "src" / "generated" / "content-versions.json"
    return json.loads(manifest_path.read_text())


def test_content_hashes_agree(js_manifest: list[dict]) -> None:
    by_hash = {e["contentHash"] for e in js_manifest}
    root = _repo_root()
    for path in iter_content_files(root / "content"):
        page = parse(path)
        assert _hash_body(page.body) in by_hash, (
            f"docsnip body hash for {path} not present in the JS manifest — "
            "the frontmatter split or body hashing has drifted"
        )


def test_doc_identity_agrees(js_manifest: list[dict]) -> None:
    docs = {
        (e["project"], e["bucket"], e["slug"])
        for e in js_manifest
        if e["area"] == "docs"
    }
    root = _repo_root()
    for path in iter_content_files(root / "content"):
        page = parse(path)
        rel = path.relative_to(root).as_posix()
        ident = _py_doc_identity(rel, page.meta)
        assert ident in docs, (
            f"docsnip identity {ident} for {rel} not in the JS manifest — "
            "path identity has drifted between Python and JS"
        )

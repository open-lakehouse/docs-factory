# /// script
# requires-python = ">=3.11"
# dependencies = ["docsnip"]
#
# [tool.uv.sources]
# docsnip = { path = "../../../../../tools/docsnip", editable = true }
#
# [tool.docs-factory]
# compose = "../../../../../envs/uc-mlflow/compose.yaml"
# services = ["unitycatalog"]
# base-url-env = "UC_BASE_URL"
# verifies = "models.sh"
# claims.cli = [
#   { journey = "model.view", region = "view", api = "uc model_version get" },
#   { journey = "model.update", region = "update", api = "uc registered_model update --comment" },
#   { journey = "model.rename", region = "rename", api = "uc registered_model update --new_name" },
#   { journey = "model.delete-version", region = "delete-version", api = "uc model_version delete" },
#   { journey = "model.delete", region = "delete-model", api = "uc registered_model delete --force" },
# ]
# ///
"""Run models.sh task by task and check what each command changed.

The page's start state, a model with versions 1 and 2, is created over REST
first: on the page, MLflow registers them.
"""

import json
import os
import urllib.request
from pathlib import Path

from docsnip.shellregions import get, run

SCRIPT = Path(__file__).with_name("models.sh")
BASE_URL = os.environ.get("UC_BASE_URL", "http://localhost:8080/api/2.1/unity-catalog")
SCHEMA = "unity.manage_models"
MODEL = f"{SCHEMA}.linear"
RENAMED = f"{SCHEMA}.linear_regression"
HAS_VERSIONS = "Unable to delete a registered model with existing model versions"


def _call(method: str, path: str, body: dict | None = None) -> dict | None:
    req = urllib.request.Request(
        f"{BASE_URL}/{path}",
        method=method,
        data=None if body is None else json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read()
            return json.loads(body) if method != "DELETE" else {}
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        raise


def _drop() -> None:
    for name in (MODEL, RENAMED):
        _call("DELETE", f"models/{name}?force=true")
    _call("DELETE", f"schemas/{SCHEMA}?force=true")


def _seed() -> None:
    _call("POST", "schemas", {"name": "manage_models", "catalog_name": "unity"})
    _call(
        "POST",
        "models",
        {"name": "linear", "catalog_name": "unity", "schema_name": "manage_models"},
    )
    for _ in range(2):
        created = _call(
            "POST",
            "models/versions",
            {
                "model_name": "linear",
                "catalog_name": "unity",
                "schema_name": "manage_models",
                "source": "models:/m-0123456789abcdef0123456789abcdef",
            },
        )
        n = created["version"]
        _call(
            "PATCH",
            f"models/{MODEL}/versions/{n}/finalize",
            {"full_name": MODEL, "version": n},
        )


if __name__ == "__main__":
    _drop()
    _seed()
    try:
        out = run(SCRIPT, "view")
        assert out.count('"status" : "READY"') == 3, out  # two listed, one fetched
        assert "s3://uc-docs/unity/__unitystorage/" in out, out
        listed = get(BASE_URL, "models?catalog_name=unity&schema_name=manage_models")
        assert [m["full_name"] for m in listed["registered_models"]] == [MODEL], listed

        run(SCRIPT, "update")
        model = get(BASE_URL, f"models/{MODEL}")
        assert model["comment"] == "Predicts y from x with a linear fit", model
        assert (
            get(BASE_URL, f"models/{MODEL}/versions/2")["comment"]
            == "Retrained on the new slope"
        )
        assert not get(BASE_URL, f"models/{MODEL}/versions/1").get("comment")

        # The first command prints the model under its new name, same id.
        out = run(SCRIPT, "rename")
        assert (
            f'"full_name" : "{RENAMED}"' in out and f'"id" : "{model["id"]}"' in out
        ), out
        assert get(BASE_URL, f"models/{RENAMED}") is None
        after = get(BASE_URL, f"models/{MODEL}")
        keep = ("id", "storage_location", "comment")
        assert [after[k] for k in keep] == [model[k] for k in keep], after
        versions = get(BASE_URL, f"models/{MODEL}/versions")["model_versions"]
        assert sorted(v["version"] for v in versions) == [1, 2], versions

        run(SCRIPT, "delete-version")
        versions = get(BASE_URL, f"models/{MODEL}/versions")["model_versions"]
        assert [v["version"] for v in versions] == [1], versions

        # Without --force, a model with versions stays.
        out = run(SCRIPT, "try-delete", expect_failure=True)
        assert HAS_VERSIONS in out, out
        assert get(BASE_URL, f"models/{MODEL}") is not None

        run(SCRIPT, "delete-model")
        assert get(BASE_URL, f"models/{MODEL}") is None
    finally:
        _drop()

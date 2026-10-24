# /// script
# requires-python = "==3.12.*"
# dependencies = [
#   "mlflow[databricks]==3.17.0",
#   "unitycatalog-client==0.7.0",
#   "scikit-learn==1.9.1",
# ]
#
# [tool.docs-factory]
# compose = "../../../../../envs/uc-mlflow/compose.yaml"
# services = ["unitycatalog", "mlflow"]
# base-url-env = "UC_BASE_URL"
# ///
"""Which service keeps which part of a registered model: MLflow or Unity Catalog.

A verifier for the explanation page, which shows none of this code. It logs a
small model to the tracking server, registers it in Unity Catalog, and checks
where the run, the logged model, and each model version end up.

Start the environment from `uc-docs-env/uc-mlflow`:

    docker compose up -d --wait

Then run this script:

    uv run model_split.py

It works in its own schema, `unity.model_split`, and removes it when it
finishes.
"""

import asyncio
import contextlib
import math
import os
import re
import tempfile
from pathlib import Path

import unitycatalog.client as uc
from unitycatalog.client.exceptions import NotFoundException

SCHEMA = "unity.model_split"
MODEL = f"{SCHEMA}.linear"
UC_URL = "http://localhost:8080/api/2.1/unity-catalog"
TRACKING_URI = "http://localhost:8080"
REGISTRY_URI = "uc:http://localhost:8080"
CATALOG_ROOT = "s3://uc-docs/unity"
# A schema with storage of its own, and a catalog with none (step 8).
ROOTED_SCHEMA = "unity.model_split_rooted"
SCHEMA_ROOT = "s3://uc-docs/model-split-rooted"
BARE_CATALOG = "model_split_bare"
NO_STORAGE = (
    "None of catalog, schema or storage-root.tables server property has managed "
    "location configured."
)
_UUID = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
VERSION_PATH = rf"/__unitystorage/catalogs/{_UUID}/models/{_UUID}/versions/{_UUID}"


def _clear_client_env() -> None:
    """Unset every AWS_* and MLFLOW_* variable the harness exported.

    The script sets the one storage variable it needs itself, so the run proves
    nothing else from the environment's client settings is needed.
    """
    for name in list(os.environ):
        if name.startswith(("AWS_", "MLFLOW_")):
            del os.environ[name]


async def _schema(action: str) -> None:
    async with uc.ApiClient(uc.Configuration(host=UC_URL)) as api:
        schemas = uc.SchemasApi(api)
        if action == "create":
            await schemas.create_schema(
                uc.CreateSchema(name="model_split", catalog_name="unity")
            )
            return
        # Remove what a failed run left behind; a passing run deleted the models.
        for name in (MODEL, f"{ROOTED_SCHEMA}.linear"):
            try:
                await uc.RegisteredModelsApi(api).delete_registered_model(
                    full_name=name, force=True
                )
            except NotFoundException:
                pass
        for name in (SCHEMA, ROOTED_SCHEMA):
            try:
                await schemas.delete_schema(full_name=name, force=True)
            except NotFoundException:
                pass
        try:
            await uc.CatalogsApi(api).delete_catalog(name=BARE_CATALOG, force=True)
        except NotFoundException:
            pass


async def _catalog_versions() -> list:
    """Every version of the model, as Unity Catalog's own API reports it."""
    async with uc.ApiClient(uc.Configuration(host=UC_URL)) as api:
        listed = await uc.ModelVersionsApi(api).list_model_versions(full_name=MODEL)
        return sorted(listed.model_versions or [], key=lambda v: v.version)


async def _catalog_root() -> str:
    async with uc.ApiClient(uc.Configuration(host=UC_URL)) as api:
        catalog = await uc.CatalogsApi(api).get_catalog(name="unity")
        return catalog.storage_root.rstrip("/")


def main() -> None:
    _clear_client_env()
    if url := os.environ.get("UC_BASE_URL"):
        assert url.rstrip("/") == UC_URL, url
    asyncio.run(_schema("drop"))
    asyncio.run(_schema("create"))
    try:
        _verify()
    finally:
        asyncio.run(_schema("drop"))


def _verify() -> None:
    import mlflow
    import pandas as pd
    from mlflow import MlflowClient
    from mlflow.models import infer_signature
    from sklearn.linear_model import LinearRegression

    os.environ["AWS_ENDPOINT_URL_S3"] = "http://localhost:9000"
    mlflow.set_tracking_uri(TRACKING_URI)
    mlflow.set_registry_uri(REGISTRY_URI)
    client = MlflowClient()

    X = pd.DataFrame({"x": [0.0, 1.0, 2.0, 3.0, 4.0]})
    model = LinearRegression(fit_intercept=True).fit(X, 2 * X["x"] + 1)
    mlflow.set_experiment("model-split")
    with mlflow.start_run() as run:
        mlflow.log_param("fit_intercept", True)
        mlflow.log_metric("r2", model.score(X, 2 * X["x"] + 1))
        info = mlflow.sklearn.log_model(
            model,
            name="linear",
            signature=infer_signature(X, model.predict(X)),
            pip_requirements=["mlflow==3.17.0", "scikit-learn==1.9.1"],
        )
    run_id = run.info.run_id

    # 1. The run, its parameter and its metric are MLflow's: read from the tracking server.
    tracked = client.get_run(run_id)
    assert tracked.data.params == {"fit_intercept": "True"}, tracked.data.params
    assert math.isclose(tracked.data.metrics["r2"], 1.0, abs_tol=1e-9), tracked.data.metrics
    # The logged model belongs to the run, under its own `models:/m-<id>` URI.
    assert re.fullmatch(r"models:/m-[0-9a-f]{32}", info.model_uri), info.model_uri
    logged = mlflow.get_logged_model(info.model_id)
    assert logged.source_run_id == run_id, logged

    # 2. Register twice: from the logged model, then from the run.
    from_model = mlflow.register_model(info.model_uri, MODEL)
    from_run = mlflow.register_model(f"runs:/{run_id}/linear", MODEL)
    assert (str(from_model.version), str(from_run.version)) == ("1", "2")
    _check_catalog_versions(info, run_id)

    # 3. The logged model's files stay in MLflow's store; the version holds a copy.
    _check_copies(mlflow, client, logged)

    # 4. The tracking server's registry: reads by name work, search and register don't.
    _check_server_registry(info, run_id)

    # 5. The steps MLflow's store takes, one at a time: a new version waits for
    # its files until it is finalized.
    asyncio.run(_check_pending_then_ready(info.model_uri))

    # 6. Deleting versions in Unity Catalog leaves the run and its files alone.
    for version in ("2", "3"):
        client.delete_model_version(MODEL, version)
    assert [v.version for v in asyncio.run(_catalog_versions())] == [1]
    after = client.get_run(run_id)
    assert after.info.lifecycle_stage == "active", after.info
    assert after.data.params == {"fit_intercept": "True"}, after.data.params
    files = {
        f.path.rsplit("/", 1)[-1]
        for f in mlflow.artifacts.list_artifacts(artifact_uri=logged.artifact_location)
    }
    assert {"MLmodel", "model.skops"} <= files, files

    # 7. The reverse: deleting the run, the logged model, and its files in MLflow
    # leaves version 1 READY in Unity Catalog, and it still loads.
    _check_catalog_survives_mlflow(mlflow, client, run_id, logged, pd)

    # 8. Where a model's storage comes from: the schema's, else the catalog's.
    asyncio.run(_check_storage_resolution())

    client.delete_model_version(MODEL, "1")
    client.delete_registered_model(MODEL)
    assert asyncio.run(_catalog_versions_or_none()) is None, "model still in the catalog"


def _check_catalog_survives_mlflow(mlflow, client, run_id: str, logged, pd) -> None:
    from mlflow.exceptions import MlflowException
    from mlflow.store.artifact.artifact_repository_registry import (
        get_artifact_repository,
    )

    client.delete_run(run_id)
    assert client.get_run(run_id).info.lifecycle_stage == "deleted", run_id
    client.delete_logged_model(logged.model_id)
    try:
        mlflow.get_logged_model(logged.model_id)
    except MlflowException as exc:
        assert "RESOURCE_DOES_NOT_EXIST" in str(exc), exc
    else:
        raise AssertionError("the logged model still exists")
    # A deleted run keeps its files until garbage collection: remove them now.
    get_artifact_repository(logged.artifact_location).delete_artifacts()
    assert mlflow.artifacts.list_artifacts(artifact_uri=logged.artifact_location) == []

    (v1,) = asyncio.run(_catalog_versions())
    assert v1.status == uc.ModelVersionStatus.READY and v1.source == f"models:/{logged.model_id}"
    loaded = mlflow.pyfunc.load_model(f"models:/{MODEL}/1")
    predicted = loaded.predict(pd.DataFrame({"x": [10.0]}))
    assert [round(float(p), 6) for p in predicted] == [21.0], predicted


async def _check_storage_resolution() -> None:
    """A model's location is under its schema's storage if set, else its catalog's.

    With neither (and no deprecated server root), creating the model fails.
    """
    from unitycatalog.client.exceptions import BadRequestException

    async with uc.ApiClient(uc.Configuration(host=UC_URL)) as api:
        schema = await uc.SchemasApi(api).create_schema(
            uc.CreateSchema(
                name=ROOTED_SCHEMA.split(".")[1], catalog_name="unity", storage_root=SCHEMA_ROOT
            )
        )
        rooted = await uc.RegisteredModelsApi(api).create_registered_model(
            uc.CreateRegisteredModel(
                name="linear", catalog_name="unity", schema_name=schema.name
            )
        )
        assert re.fullmatch(
            re.escape(SCHEMA_ROOT) + rf"/__unitystorage/schemas/{_UUID}/models/{_UUID}",
            rooted.storage_location,
        ), rooted.storage_location
        catalog = await uc.CatalogsApi(api).get_catalog(name="unity")
        plain = await uc.RegisteredModelsApi(api).get_registered_model(full_name=MODEL)
        assert plain.storage_location.startswith(
            catalog.storage_location.rstrip("/") + "/models/"
        ), (plain.storage_location, catalog.storage_location)
        await uc.RegisteredModelsApi(api).delete_registered_model(
            full_name=f"{ROOTED_SCHEMA}.linear"
        )
        await uc.SchemasApi(api).delete_schema(full_name=ROOTED_SCHEMA)

        await uc.CatalogsApi(api).create_catalog(uc.CreateCatalog(name=BARE_CATALOG))
        try:
            await uc.SchemasApi(api).create_schema(
                uc.CreateSchema(name="models", catalog_name=BARE_CATALOG)
            )
            try:
                await uc.RegisteredModelsApi(api).create_registered_model(
                    uc.CreateRegisteredModel(
                        name="linear", catalog_name=BARE_CATALOG, schema_name="models"
                    )
                )
            except BadRequestException as exc:
                assert "FAILED_PRECONDITION" in exc.body and NO_STORAGE in exc.body, exc.body
            else:
                raise AssertionError("created a model with no managed storage")
        finally:
            await uc.CatalogsApi(api).delete_catalog(name=BARE_CATALOG, force=True)


async def _catalog_versions_or_none():
    try:
        return await _catalog_versions()
    except NotFoundException:
        return None


def _check_catalog_versions(info, run_id: str) -> None:
    """Unity Catalog's record of each version: status, storage, source, run."""
    root = asyncio.run(_catalog_root())
    assert root == CATALOG_ROOT, root
    v1, v2 = asyncio.run(_catalog_versions())
    for v in (v1, v2):
        assert v.status == uc.ModelVersionStatus.READY, v
        assert re.fullmatch(re.escape(root) + VERSION_PATH, v.storage_location), v
        # The source is the logged model either way: MLflow resolves `runs:/`.
        assert v.source == info.model_uri, (v.version, v.source)
    assert v1.storage_location != v2.storage_location, (v1, v2)
    # Only a `runs:/` registration records the run on the version.
    assert not v1.run_id, v1.run_id
    assert v2.run_id == run_id, (v2.run_id, run_id)
    print("source:", v1.source)
    print("run_id (models:/):", repr(v1.run_id), "run_id (runs:/):", v2.run_id)
    print("storage_location:", v1.storage_location)


def _check_copies(mlflow, client, logged) -> None:
    """The logged model is in MLflow's artifact store; each version has its own copy."""
    location = logged.artifact_location
    # Proxied by the tracking server (`--serve-artifacts`): not a catalog path.
    assert re.fullmatch(
        rf"mlflow-artifacts:/\d+/models/{logged.model_id}/artifacts", location
    ), location
    assert CATALOG_ROOT not in location and "uc-docs" not in location, location
    download = client.get_model_version_download_uri(MODEL, "1")
    assert download.startswith(CATALOG_ROOT + "/__unitystorage/"), download

    def files(uri: str) -> dict[str, bytes]:
        with tempfile.TemporaryDirectory() as tmp:
            local = Path(mlflow.artifacts.download_artifacts(artifact_uri=uri, dst_path=tmp))
            return {
                p.relative_to(local).as_posix(): p.read_bytes()
                for p in local.rglob("*")
                if p.is_file()
            }

    in_mlflow = files(location)
    in_catalog = files(f"models:/{MODEL}/1")
    assert {"MLmodel", "model.skops"} <= in_mlflow.keys(), in_mlflow.keys()
    # The copy is the logged model's files, byte for byte, plus one file MLflow
    # writes while registering: which model and version this copy is.
    meta = in_catalog.pop("registered_model_meta").decode()
    assert in_catalog == in_mlflow, (in_catalog.keys(), in_mlflow.keys())
    assert f"model_name: {MODEL}" in meta and "model_version: '1'" in meta, meta
    assert "registered_model_meta" not in files(location), "logged model changed"
    print("logged model:", location)
    print("files:", sorted(in_mlflow), "+ registered_model_meta:", meta.strip())


async def _check_pending_then_ready(source: str) -> None:
    """CreateModelVersion returns PENDING_REGISTRATION; FinalizeModelVersion makes it READY."""
    async with uc.ApiClient(uc.Configuration(host=UC_URL)) as api:
        versions = uc.ModelVersionsApi(api)
        created = await versions.create_model_version(
            uc.CreateModelVersion(
                model_name="linear",
                catalog_name="unity",
                schema_name="model_split",
                source=source,
            )
        )
        assert created.version == 3, created
        assert created.status == uc.ModelVersionStatus.PENDING_REGISTRATION, created
        assert re.fullmatch(re.escape(CATALOG_ROOT) + VERSION_PATH, created.storage_location)
        finalized = await versions.finalize_model_version(
            full_name=MODEL,
            version=3,
            finalize_model_version=uc.FinalizeModelVersion(full_name=MODEL, version=3),
        )
        assert finalized.status == uc.ModelVersionStatus.READY, finalized


@contextlib.contextmanager
def _no_retries():
    """Fail fast on a 500: MLflow otherwise retries with backoff for minutes."""
    os.environ["MLFLOW_HTTP_REQUEST_MAX_RETRIES"] = "0"
    try:
        yield
    finally:
        del os.environ["MLFLOW_HTTP_REQUEST_MAX_RETRIES"]


def _check_server_registry(info, run_id: str) -> None:
    """The tracking server's registry (an http registry URI, no `uc:`) is Unity Catalog.

    Reads by name return the catalog's own record. Searching and registering
    through the server fail on this stack, so the page describes only the
    client's `uc:` path. If these start passing, revisit that section.
    """
    from mlflow import MlflowClient
    from mlflow.exceptions import MlflowException

    server = MlflowClient(tracking_uri=TRACKING_URI, registry_uri=TRACKING_URI)
    assert server.get_registered_model(MODEL).name == MODEL
    v1 = server.get_model_version(MODEL, "1")
    assert v1.source == info.model_uri and v1.status == "READY", v1
    expected = asyncio.run(_catalog_versions())[0].storage_location
    assert server.get_model_version_download_uri(MODEL, "1") == expected

    gaps = {
        # MLflow's client always adds a prompt filter, which the UC store refuses.
        "search models": lambda: server.search_registered_models(),
        # The UC store returns versions without aliases; the server can't serialize them.
        "search versions": lambda: server.search_model_versions(f"name='{MODEL}'"),
        # Inside `mlflow server` the tracking URI is the backend database, so the
        # store can't download the `mlflow-artifacts:` source it must copy.
        "register": lambda: server.create_model_version(
            MODEL, f"runs:/{run_id}/linear", run_id=run_id
        ),
    }
    with _no_retries():
        for label, call in gaps.items():
            try:
                call()
            except MlflowException as exc:
                assert "500" in str(exc), (label, exc)
            else:
                raise AssertionError(f"{label} through the tracking server now works")
    versions = asyncio.run(_catalog_versions())
    assert [v.version for v in versions] == [1, 2], "the failed register left a version"


if __name__ == "__main__":
    main()

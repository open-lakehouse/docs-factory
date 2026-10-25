# /// script
# requires-python = "==3.12.*"
# dependencies = [
#   "mlflow==3.17.0",
#   "boto3==1.43.114",
#   "unitycatalog-client==0.7.0",
#   "scikit-learn==1.9.1",
# ]
#
# [tool.docs-factory]
# compose = "../../../../../envs/uc-mlflow/compose.yaml"
# services = ["unitycatalog", "mlflow"]
# base-url-env = "UC_BASE_URL"
# claims.mlflow = [
#   { journey = "model.register", region = "register", api = "mlflow.register_model" },
#   { journey = "model.load", region = "load", api = "mlflow.pyfunc.load_model" },
# ]
# ///
"""Train a small model, log it to MLflow, register it in Unity Catalog, load it back.

The regions are what a reader types into `python -m asyncio`, step by step.

Start the environment from `uc-docs-env/uc-mlflow`:

    docker compose up -d --wait

Then run this script:

    uv run hello_mlflow.py

The tracking server keeps runs and logged models. Registered models live in
Unity Catalog, in the `unity` catalog the environment creates.
"""

import asyncio
import os
import re

import unitycatalog.client as uc
from unitycatalog.client.exceptions import NotFoundException

SCHEMA = "unity.hello"
MODEL = f"{SCHEMA}.linear"
UC_URL = "http://localhost:8080/api/2.1/unity-catalog"
CATALOG_ROOT = "s3://amzn-s3-demo-bucket/unity"
_UUID = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"


def _clear_client_env() -> dict[str, str]:
    """Unset every AWS_* and MLFLOW_* variable, and return what was set.

    The session below sets the variables it needs itself, so this run
    proves that nothing else from the environment's client settings is needed.
    """
    return {
        name: os.environ.pop(name)
        for name in list(os.environ)
        if name.startswith(("AWS_", "MLFLOW_"))
    }


async def main() -> None:
    exported = _clear_client_env()
    if url := os.environ.get("UC_BASE_URL"):
        assert url.rstrip("/") == UC_URL, url
    cleanup_api = uc.ApiClient(uc.Configuration(host=UC_URL))
    try:
        await _tutorial(exported)
    finally:
        await _cleanup(cleanup_api)
        await cleanup_api.close()


async def _tutorial(exported: dict[str, str]) -> None:
    # --8<-- [start:connect]
    import os

    import mlflow

    os.environ["AWS_ENDPOINT_URL_S3"] = "http://localhost:9000"
    os.environ["MLFLOW_ENABLE_PROXY_MULTIPART_DOWNLOAD"] = "false"
    os.environ["MLFLOW_ENABLE_PROXY_MULTIPART_UPLOAD"] = "false"
    mlflow.set_tracking_uri("http://localhost:8080")
    mlflow.set_registry_uri("uc:http://localhost:8080")
    # --8<-- [end:connect]
    _check_connect(mlflow, exported)

    # --8<-- [start:schema]
    from unitycatalog.client import ApiClient, Configuration, CreateSchema, SchemasApi

    api = ApiClient(Configuration(host="http://localhost:8080/api/2.1/unity-catalog"))
    schema = await SchemasApi(api).create_schema(
        CreateSchema(name="hello", catalog_name="unity")
    )
    print(schema.full_name)
    # --8<-- [end:schema]
    assert schema.full_name == SCHEMA, schema

    # --8<-- [start:train]
    import pandas as pd
    from sklearn.linear_model import LinearRegression

    X = pd.DataFrame({"x": [0.0, 1.0, 2.0, 3.0, 4.0]})
    y = 2 * X["x"] + 1
    model = LinearRegression().fit(X, y)
    # --8<-- [end:train]

    # --8<-- [start:log]
    from mlflow.models import infer_signature

    signature = infer_signature(X, model.predict(X))
    experiment = mlflow.set_experiment("hello-mlflow")
    with mlflow.start_run() as run:
        info = mlflow.sklearn.log_model(
            model,
            name="linear",
            signature=signature,
            input_example=X.head(2),
            pip_requirements=["mlflow==3.17.0", "scikit-learn==1.9.1"],
        )

    print(info.model_id)
    # --8<-- [end:log]
    assert signature.inputs is not None and signature.outputs is not None, signature
    assert info.model_id.startswith("m-") and info.run_id == run.info.run_id, info

    # --8<-- [start:register]
    version = mlflow.register_model(info.model_uri, "unity.hello.linear")
    print(version.name, version.version)
    # --8<-- [end:register]
    assert version.name == MODEL, version
    assert str(version.version) == "1", version

    # --8<-- [start:inspect]
    from mlflow import MlflowClient

    client = MlflowClient()
    logged = mlflow.get_logged_model(info.model_id)
    print("logged model: ", logged.artifact_location)
    print(
        "model version:",
        client.get_model_version_download_uri("unity.hello.linear", "1"),
    )
    # --8<-- [end:inspect]
    await _check_inspect(api, client, info, logged.artifact_location)

    # --8<-- [start:load]
    loaded = mlflow.pyfunc.load_model("models:/unity.hello.linear/1")
    print(loaded.metadata.signature)
    print(loaded.predict(pd.DataFrame({"x": [10.0]})))
    # --8<-- [end:load]
    _check_loaded(loaded, pd)

    # --8<-- [start:clean-up]
    client.delete_model_version("unity.hello.linear", "1")
    client.delete_registered_model("unity.hello.linear")
    await SchemasApi(api).delete_schema(full_name="unity.hello")
    await api.close()
    # --8<-- [end:clean-up]
    await _check_cleaned_up(mlflow, client, run.info.run_id, logged.artifact_location)
    assert experiment.name == "hello-mlflow", experiment


def _check_connect(mlflow, exported: dict[str, str]) -> None:
    """The settings the session sets match the environment's client settings.

    Compared only where those settings were exported before the run.
    """
    proxied = (
        "MLFLOW_ENABLE_PROXY_MULTIPART_DOWNLOAD",
        "MLFLOW_ENABLE_PROXY_MULTIPART_UPLOAD",
    )
    expected = {
        "MLFLOW_TRACKING_URI": mlflow.get_tracking_uri(),
        "MLFLOW_REGISTRY_URI": mlflow.get_registry_uri(),
        "AWS_ENDPOINT_URL_S3": os.environ["AWS_ENDPOINT_URL_S3"],
        **{name: os.environ[name] for name in proxied},
    }
    for name, value in expected.items():
        if name in exported:
            assert exported[name] == value, (name, exported[name], value)
    # The only storage setting is the one the session sets. (MLflow itself
    # exports the two URIs it was given, for child processes.)
    aws = sorted(n for n in os.environ if n.startswith("AWS_"))
    assert aws == ["AWS_ENDPOINT_URL_S3"], aws
    flow = {n for n in os.environ if n.startswith("MLFLOW_")}
    assert flow <= {"MLFLOW_TRACKING_URI", "MLFLOW_REGISTRY_URI", *proxied}, flow


async def _check_inspect(api, client, info, logged_location: str) -> None:
    """The logged model stays with MLflow; the version's copy is in catalog storage."""
    download_uri = client.get_model_version_download_uri(MODEL, "1")
    catalog = await uc.CatalogsApi(api).get_catalog(name="unity")
    root = catalog.storage_root.rstrip("/")
    assert root == CATALOG_ROOT, catalog
    # Managed storage names the model and the version by id, not name or number.
    pattern = rf"/__unitystorage/catalogs/{_UUID}/models/{_UUID}/versions/{_UUID}"
    assert re.fullmatch(re.escape(root) + pattern, download_uri), (download_uri, root)
    # The tracking server proxies the logged model's files: no bucket is visible.
    assert re.fullmatch(
        rf"mlflow-artifacts:/\d+/models/{info.model_id}/artifacts", logged_location
    ), logged_location
    assert not logged_location.startswith(root), (logged_location, root)
    # Registering copied from the logged model, not from the run.
    assert info.model_uri == f"models:/{info.model_id}", info.model_uri


def _check_loaded(loaded, pd) -> None:
    from mlflow.types import DataType

    sig = loaded.metadata.signature
    assert sig is not None and sig.inputs is not None and sig.outputs is not None, sig
    (column,) = sig.inputs.inputs
    assert column.name == "x" and column.type == DataType.double, column
    predicted = loaded.predict(pd.DataFrame({"x": [10.0]}))
    assert [round(float(p), 6) for p in predicted] == [21.0], predicted


async def _check_cleaned_up(mlflow, client, run_id: str, logged_location: str) -> None:
    """The registry entries are gone; the run and the logged model's files stay."""
    from mlflow.exceptions import MlflowException

    try:
        client.get_registered_model(MODEL)
    except MlflowException:
        pass
    else:
        raise AssertionError(f"{MODEL} still exists after clean-up")
    async with uc.ApiClient(uc.Configuration(host=UC_URL)) as api:
        try:
            await uc.SchemasApi(api).get_schema(full_name=SCHEMA)
        except NotFoundException:
            pass
        else:
            raise AssertionError(f"{SCHEMA} still exists after clean-up")
    assert mlflow.get_run(run_id).info.lifecycle_stage == "active", run_id
    files = {
        f.path.rsplit("/", 1)[-1]
        for f in mlflow.artifacts.list_artifacts(artifact_uri=logged_location)
    }
    assert {"MLmodel", "model.skops"} <= files, files


async def _cleanup(api) -> None:
    """Remove what a failed run left behind; a passing run already cleaned up."""
    from mlflow import MlflowClient

    client = MlflowClient()
    try:
        versions = client.search_model_versions(f"name='{MODEL}'")
    except Exception:  # noqa: BLE001 - the schema or model may not exist
        versions = []
    for v in versions:
        client.delete_model_version(MODEL, v.version)
    if versions:
        client.delete_registered_model(MODEL)
    try:
        await uc.SchemasApi(api).delete_schema(full_name=SCHEMA)
    except NotFoundException:
        pass


if __name__ == "__main__":
    asyncio.run(main())

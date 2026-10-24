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
# claims.mlflow = [
#   { journey = "model.register", region = "register", api = "mlflow.register_model" },
#   { journey = "model.view", region = "view", api = "MlflowClient.search_model_versions" },
#   { journey = "model.load", region = "load", api = "mlflow.pyfunc.load_model" },
#   { journey = "model.update", region = "update", api = "MlflowClient.update_model_version" },
#   { journey = "model.delete-version", region = "delete-version", api = "MlflowClient.delete_model_version" },
#   { journey = "model.delete", region = "delete-model", api = "MlflowClient.delete_registered_model" },
#   { journey = "model.rename", fails = "Method not implemented", anchor = "rename-a-model" },
#   { journey = "model.alias", fails = "Method not implemented", anchor = "load-a-model-version" },
# ]
# ///
"""Register, view, load, update, and delete Unity Catalog models with MLflow.

The regions are what a reader types into a `python` session, in order. The
script also checks what MLflow's Unity Catalog store refuses: aliases, stages
and `latest`, tags, renaming, and search filters.

Start the environment from `uc-docs-env/uc-mlflow`:

    docker compose up -d --wait

Then run this script:

    uv run models_mlflow.py

The tracking server keeps runs and logged models. Registered models live in
Unity Catalog, in the `unity` catalog the environment creates.
"""

import asyncio
import contextlib
import io
import os
import re
import sys
import tempfile
from pathlib import Path

import unitycatalog.client as uc
from unitycatalog.client.exceptions import NotFoundException

SCHEMA = "unity.manage_models"
MODEL = f"{SCHEMA}.linear"
UC_URL = "http://localhost:8080/api/2.1/unity-catalog"
CATALOG_ROOT = "s3://uc-docs/unity"
UNSUPPORTED = "Method not implemented"
HAS_VERSIONS = "Unable to delete a registered model with existing model versions"
PAGE = 100  # the server's page size for listing model versions
_UUID = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"


def _clear_client_env() -> None:
    """Unset every AWS_* and MLFLOW_* variable the harness exported.

    The `connect` region sets the one variable it needs itself, so this run
    proves that nothing else from the environment's client settings is needed.
    """
    for name in list(os.environ):
        if name.startswith(("AWS_", "MLFLOW_")):
            del os.environ[name]


@contextlib.contextmanager
def _stderr():
    """Capture what MLflow prints to stderr, and pass it on afterwards."""
    buf = io.StringIO()
    with contextlib.redirect_stderr(buf):
        yield buf
    sys.stderr.write(buf.getvalue())


async def _schema(action: str) -> None:
    async with uc.ApiClient(uc.Configuration(host=UC_URL)) as api:
        schemas = uc.SchemasApi(api)
        if action == "create":
            await schemas.create_schema(
                uc.CreateSchema(name="manage_models", catalog_name="unity")
            )
            return
        # Remove what a failed run left behind; a passing run deleted the models.
        for name in (MODEL, f"{SCHEMA}.tagged"):
            try:
                await uc.RegisteredModelsApi(api).delete_registered_model(
                    full_name=name, force=True
                )
            except NotFoundException:
                pass
        try:
            await schemas.delete_schema(full_name=SCHEMA, force=True)
        except NotFoundException:
            pass


async def _pad_versions(count: int) -> None:
    """Add file-less versions over REST, so the model has more than a page."""
    async with uc.ApiClient(uc.Configuration(host=UC_URL)) as api:
        versions = uc.ModelVersionsApi(api)
        for _ in range(count):
            created = await versions.create_model_version(
                uc.CreateModelVersion(
                    model_name="linear",
                    catalog_name="unity",
                    schema_name="manage_models",
                    source="models:/m-0123456789abcdef0123456789abcdef",
                )
            )
            await versions.finalize_model_version(
                full_name=MODEL,
                version=created.version,
                finalize_model_version=uc.FinalizeModelVersion(
                    full_name=MODEL, version=created.version
                ),
            )


def main() -> None:
    _clear_client_env()
    if url := os.environ.get("UC_BASE_URL"):
        assert url.rstrip("/") == UC_URL, url
    asyncio.run(_schema("drop"))
    asyncio.run(_schema("create"))
    try:
        _how_to()
    finally:
        asyncio.run(_schema("drop"))


def _how_to() -> None:
    # --8<-- [start:connect]
    import os

    import mlflow
    from mlflow import MlflowClient

    os.environ["AWS_ENDPOINT_URL_S3"] = "http://localhost:9000"
    mlflow.set_tracking_uri("http://localhost:8080")
    mlflow.set_registry_uri("uc:http://localhost:8080")
    client = MlflowClient()
    # --8<-- [end:connect]
    aws = sorted(n for n in os.environ if n.startswith("AWS_"))
    assert aws == ["AWS_ENDPOINT_URL_S3"], aws

    # --8<-- [start:log]
    import pandas as pd
    from mlflow.models import infer_signature
    from sklearn.linear_model import LinearRegression

    X = pd.DataFrame({"x": [0.0, 1.0, 2.0, 3.0, 4.0]})
    mlflow.set_experiment("manage-models")
    model_uris = []
    for slope in (2, 3):
        fitted = LinearRegression().fit(X, slope * X["x"] + 1)
        with mlflow.start_run():
            info = mlflow.sklearn.log_model(
                fitted,
                name="linear",
                signature=infer_signature(X, fitted.predict(X)),
                pip_requirements=["mlflow==3.17.0", "scikit-learn==1.9.1"],
            )
        model_uris.append(info.model_uri)

    print(model_uris)
    # --8<-- [end:log]
    # Each logged model has a `models:/m-<id>` URI; the second is the retrained one.
    assert len(model_uris) == 2, model_uris
    assert all(re.fullmatch(r"models:/m-[0-9a-f]{32}", u) for u in model_uris), (
        model_uris
    )
    first_model_id = model_uris[0].removeprefix("models:/")
    first_run_id = mlflow.get_logged_model(first_model_id).source_run_id

    with _stderr() as err:
        # --8<-- [start:register]
        version = mlflow.register_model(model_uris[0], "unity.manage_models.linear")
        print(version.version, version.status)
        # --8<-- [end:register]
    # The first call creates the model, then adds version 1.
    assert str(version.version) == "1" and version.status == "READY", version
    assert (
        "Successfully registered model 'unity.manage_models.linear'." in err.getvalue()
    )
    assert (
        "Created version '1' of model 'unity.manage_models.linear'." in err.getvalue()
    )
    # The version records the logged model it copied from, and no run.
    assert version.source == model_uris[0] and not version.run_id, version

    with _stderr() as err:
        # --8<-- [start:new-version]
        version = mlflow.register_model(model_uris[1], "unity.manage_models.linear")
        print(version.version, version.status)
        # --8<-- [end:new-version]
    # A later call finds the model and adds the next number.
    assert str(version.version) == "2" and version.status == "READY", version
    assert (
        "Registered model 'unity.manage_models.linear' already exists. "
        "Creating a new version of this model..."
    ) in err.getvalue(), err.getvalue()
    assert (
        "Created version '2' of model 'unity.manage_models.linear'." in err.getvalue()
    )
    _check_tags_dropped(mlflow, client, model_uris[0])

    # --8<-- [start:view]
    for model in client.search_registered_models():
        print(model.name, model.description)

    for v in client.search_model_versions("name='unity.manage_models.linear'"):
        print(v.version, v.status, v.source)

    # --8<-- [end:view]
    _check_view(client)
    _check_search_rejections(client)

    # --8<-- [start:load]
    model = mlflow.pyfunc.load_model("models:/unity.manage_models.linear/1")
    print(model.metadata.signature)
    print(model.predict(pd.DataFrame({"x": [10.0]})))
    print(client.get_model_version_download_uri("unity.manage_models.linear", "1"))
    # --8<-- [end:load]
    _check_load(mlflow, client, model, pd)
    _check_unsupported(mlflow, client)

    # --8<-- [start:update]
    client.update_registered_model(
        "unity.manage_models.linear",
        description="Predicts y from x with a linear fit",
    )
    client.update_model_version(
        "unity.manage_models.linear", "2", description="Retrained on the new slope"
    )
    # --8<-- [end:update]
    assert client.get_registered_model(MODEL).description.startswith("Predicts"), MODEL
    assert client.get_model_version(MODEL, "2").description.startswith("Retrained")
    assert client.get_model_version(MODEL, "1").description == "", "v1 unchanged"

    # --8<-- [start:delete-version]
    client.delete_model_version("unity.manage_models.linear", "2")
    # --8<-- [end:delete-version]
    _check_number_not_reused(mlflow, client, first_run_id)

    # Give the model more versions than one search returns, so the loop below
    # must search again: versions 1 and 3, plus 99 more.
    asyncio.run(_pad_versions(99))
    first_page = client.search_model_versions(f"name='{MODEL}'")
    assert len(first_page) == PAGE and first_page.token, (
        len(first_page),
        first_page.token,
    )

    # --8<-- [start:delete-model]
    name = "unity.manage_models.linear"
    while versions := client.search_model_versions(f"name='{name}'"):
        for v in versions:
            client.delete_model_version(name, v.version)

    client.delete_registered_model(name)
    # --8<-- [end:delete-model]
    _check_deleted(mlflow, client, first_run_id, first_model_id, model_uris[0])


def _check_tags_dropped(mlflow, client, model_uri: str) -> None:
    """Tags passed while registering or creating a model are silently dropped."""
    tagged = f"{SCHEMA}.tagged"
    v = mlflow.register_model(model_uri, tagged, tags={"team": "forecasting"})
    try:
        assert v.tags == {} and client.get_model_version(tagged, "1").tags == {}, v
        assert client.get_registered_model(tagged).tags == {}, "model tags"
        client.delete_model_version(tagged, "1")
        client.delete_registered_model(tagged)
        created = client.create_registered_model(tagged, tags={"team": "forecasting"})
        assert created.tags == {} and client.get_registered_model(tagged).tags == {}
    finally:
        # On a failed check the model may still have a version; the final
        # clean-up deletes it with `force`.
        with contextlib.suppress(Exception):
            client.delete_registered_model(tagged)


def _check_view(client) -> None:
    names = [m.name for m in client.search_registered_models()]
    assert MODEL in names, names
    versions = client.search_model_versions(f"name='{MODEL}'")
    assert sorted(int(v.version) for v in versions) == [1, 2], versions
    assert {v.status for v in versions} == {"READY"}, versions
    assert all(v.source.startswith("models:/m-") for v in versions), versions


def _check_search_rejections(client) -> None:
    """The store refuses a search filter on models, and ordering on either search."""
    from mlflow.exceptions import MlflowException

    calls = [
        (
            "filter_string",
            lambda: client.search_registered_models(filter_string=f"name='{MODEL}'"),
        ),
        ("order_by", lambda: client.search_registered_models(order_by=["name ASC"])),
        (
            "order_by",
            lambda: client.search_model_versions(
                f"name='{MODEL}'", order_by=["version_number DESC"]
            ),
        ),
    ]
    for arg, call in calls:
        try:
            call()
        except MlflowException as exc:
            expected = (
                f"Argument '{arg}' is unsupported for models in the Unity Catalog"
            )
            assert expected in str(exc), exc
        else:
            raise AssertionError(f"search accepted {arg}")


def _check_load(mlflow, client, model, pd) -> None:
    """Each number loads its own version; the signature comes from its files."""
    from mlflow.types import DataType

    predicted = model.predict(pd.DataFrame({"x": [10.0]}))
    assert [round(float(p), 6) for p in predicted] == [21.0], predicted
    v2 = mlflow.pyfunc.load_model(f"models:/{MODEL}/2")
    assert [round(float(p), 6) for p in v2.predict(pd.DataFrame({"x": [10.0]}))] == [
        31.0
    ]
    uri = client.get_model_version_download_uri(MODEL, "1")
    pattern = rf"/__unitystorage/catalogs/{_UUID}/models/{_UUID}/versions/{_UUID}"
    assert re.fullmatch(re.escape(CATALOG_ROOT) + pattern, uri), uri

    sig = model.metadata.signature
    (column,) = sig.inputs.inputs
    assert column.name == "x" and column.type == DataType.double, sig
    assert sig.outputs is not None, sig
    # The signature is in the version's MLmodel file in catalog storage; the
    # catalog's version record has no field for it.
    with tempfile.TemporaryDirectory() as tmp:
        local = mlflow.artifacts.download_artifacts(
            artifact_uri=f"models:/{MODEL}/1", dst_path=tmp
        )
        mlmodel = (Path(local) / "MLmodel").read_text()
    assert "signature:" in mlmodel and '"name": "x"' in mlmodel, mlmodel
    assert "signature" not in uc.ModelVersionInfo.model_fields, (
        uc.ModelVersionInfo.model_fields
    )


def _check_unsupported(mlflow, client) -> None:
    """MLflow's Unity Catalog store raises NotImplementedError for each of these."""
    calls = {
        "set alias": lambda: client.set_registered_model_alias(MODEL, "champion", "1"),
        "delete alias": lambda: client.delete_registered_model_alias(MODEL, "champion"),
        "get by alias": lambda: client.get_model_version_by_alias(MODEL, "champion"),
        "load by alias": lambda: mlflow.pyfunc.load_model(f"models:/{MODEL}@champion"),
        "load latest": lambda: mlflow.pyfunc.load_model(f"models:/{MODEL}/latest"),
        "latest versions": lambda: client.get_latest_versions(MODEL),
        "stage": lambda: client.transition_model_version_stage(
            MODEL, "1", "Production"
        ),
        "model tag": lambda: client.set_registered_model_tag(MODEL, "team", "ml"),
        "version tag": lambda: client.set_model_version_tag(MODEL, "1", "team", "ml"),
        "rename": lambda: client.rename_registered_model(MODEL, f"{SCHEMA}.forecast"),
    }
    for label, call in calls.items():
        try:
            call()
        except NotImplementedError as exc:
            assert str(exc) == UNSUPPORTED, (label, exc)
        else:
            raise AssertionError(
                f"{label}: MLflow's Unity Catalog store now supports it"
            )
    # Nothing changed: the model kept its name and both versions.
    assert client.get_registered_model(MODEL).name == MODEL


def _check_number_not_reused(mlflow, client, run_id: str) -> None:
    """After deleting the newest version, the next one still gets a new number.

    Registering from a `runs:/` URI records the run on the version; the source
    is still the logged model MLflow resolved it to.
    """
    numbers = sorted(
        int(v.version) for v in client.search_model_versions(f"name='{MODEL}'")
    )
    assert numbers == [1], numbers
    again = mlflow.register_model(f"runs:/{run_id}/linear", MODEL)
    assert str(again.version) == "3", again
    assert again.run_id == run_id and again.source.startswith("models:/m-"), again


def _check_deleted(mlflow, client, run_id: str, model_id: str, model_uri: str) -> None:
    """The model is gone from the catalog; the run and the logged model stay.

    Before its versions are deleted, MLflow can't delete the model: it sends no
    `force`, so the server refuses.
    """
    from mlflow.exceptions import MlflowException

    try:
        client.get_registered_model(MODEL)
    except MlflowException as exc:
        assert "NOT_FOUND" in str(exc), exc
    else:
        raise AssertionError(f"{MODEL} still exists")
    assert mlflow.get_run(run_id).info.lifecycle_stage == "active", run_id
    logged = mlflow.get_logged_model(model_id)
    files = {
        f.path.rsplit("/", 1)[-1]
        for f in mlflow.artifacts.list_artifacts(artifact_uri=logged.artifact_location)
    }
    assert {"MLmodel", "model.skops"} <= files, files

    # Re-create the model with one version and try to delete it in one step.
    mlflow.register_model(model_uri, MODEL)
    try:
        client.delete_registered_model(MODEL)
    except MlflowException as exc:
        assert "ABORTED" in str(exc) and HAS_VERSIONS in str(exc), exc
    else:
        raise AssertionError("deleted a model that still had versions")
    client.delete_model_version(MODEL, "1")
    client.delete_registered_model(MODEL)


if __name__ == "__main__":
    main()

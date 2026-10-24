# /// script
# requires-python = "==3.12.*"
# dependencies = ["mlflow[databricks]==3.17.0", "unitycatalog-client==0.7.0"]
#
# [tool.docs-factory]
# compose = "../../../../../envs/uc-mlflow/compose.yaml"
# services = ["unitycatalog", "mlflow"]
# base-url-env = "UC_BASE_URL"
# ///
"""Log a model to MLflow, register it in Unity Catalog, and load it back.

Start the environment from `uc-docs-env/uc-mlflow`:

    docker compose up -d --wait

Export the addresses its `client/host.env` lists (MLFLOW_TRACKING_URI,
MLFLOW_REGISTRY_URI, and the S3 endpoint), then run this script:

    uv run hello_mlflow.py

The tracking server keeps runs and their artifacts. Registered models live in
Unity Catalog, in the `unity` catalog the environment creates.
"""

import asyncio
import os

from unitycatalog.client import ApiClient, Configuration, CreateSchema, SchemasApi
from unitycatalog.client.exceptions import NotFoundException

UC_URL = os.environ.get("UC_BASE_URL", "http://localhost:8080/api/2.1/unity-catalog")
SCHEMA = "unity.hello"
MODEL = f"{SCHEMA}.greeter"


async def create_schema() -> None:
    async with ApiClient(Configuration(host=UC_URL)) as api:
        try:
            await SchemasApi(api).get_schema(full_name=SCHEMA)
        except NotFoundException:
            await SchemasApi(api).create_schema(
                CreateSchema(name="hello", catalog_name="unity")
            )


async def drop_schema() -> None:
    async with ApiClient(Configuration(host=UC_URL)) as api:
        await SchemasApi(api).delete_schema(full_name=SCHEMA)


def main() -> tuple[object, list[str]]:
    # --8<-- [start:log]
    import mlflow
    import pandas as pd

    class Greeter(mlflow.pyfunc.PythonModel):
        def predict(self, context, model_input, params=None):
            return [f"Hello, {name}!" for name in model_input["name"]]

    mlflow.set_experiment("hello-mlflow")
    example = pd.DataFrame({"name": ["Unity"]})
    with mlflow.start_run():
        mlflow.log_param("greeting", "Hello")
        mlflow.log_metric("names", 1)
        info = mlflow.pyfunc.log_model(
            name="greeter",
            python_model=Greeter(),
            input_example=example,
            pip_requirements=["mlflow==3.17.0", "pandas"],
        )
    # --8<-- [end:log]

    # --8<-- [start:register]
    version = mlflow.register_model(info.model_uri, MODEL)
    print(f"registered {MODEL} version {version.version}")
    # --8<-- [end:register]

    # --8<-- [start:load]
    model = mlflow.pyfunc.load_model(f"models:/{MODEL}/{version.version}")
    print(model.predict(pd.DataFrame({"name": ["Unity", "MLflow"]})))
    # --8<-- [end:load]
    return version, list(model.predict(pd.DataFrame({"name": ["Unity"]})))


if __name__ == "__main__":
    from mlflow import MlflowClient

    for var in ("MLFLOW_TRACKING_URI", "MLFLOW_REGISTRY_URI"):
        assert os.environ.get(var), f"{var} is not set"
    asyncio.run(create_schema())
    try:
        version, greeting = main()
        assert str(version.version) == "1", version
        assert greeting == ["Hello, Unity!"], greeting
    finally:
        # Unity Catalog deletes a model only once it has no versions, and a schema
        # only once it has no models.
        client = MlflowClient()
        versions = client.search_model_versions(f"name='{MODEL}'")
        for v in versions:
            client.delete_model_version(MODEL, v.version)
        if versions:
            client.delete_registered_model(MODEL)
        asyncio.run(drop_schema())

# /// script
# requires-python = ">=3.11"
# dependencies = ["unitycatalog-client==0.7.0"]
#
# [tool.docs-factory]
# compose = "../../../../../envs/uc-mlflow/compose.yaml"
# services = ["unitycatalog"]
# base-url-env = "UC_BASE_URL"
# claims."python-sdk" = [
#   { journey = "model.view", region = "view", api = "ModelVersionsApi.get_model_version" },
#   { journey = "model.update", region = "update", api = "RegisteredModelsApi.update_registered_model" },
#   { journey = "model.rename", region = "rename", api = "UpdateRegisteredModel(new_name=...)" },
#   { journey = "model.delete-version", region = "delete-version", api = "ModelVersionsApi.delete_model_version" },
#   { journey = "model.delete", region = "delete-model", api = "RegisteredModelsApi.delete_registered_model" },
# ]
# ///
"""View, update, rename, and delete registered models with the Python SDK.

The regions are what a reader types into `python -m asyncio`, in order. They
start from a model `unity.manage_models.linear` with versions 1 and 2, which
MLflow registers on the page; this script creates them itself first.

Start the environment from `uc-docs-env/uc-mlflow`:

    docker compose up -d --wait

Then run this script:

    uv run models_sdk.py
"""

import asyncio
import os

import unitycatalog.client as uc
from unitycatalog.client.exceptions import ApiException, NotFoundException

UC_URL = "http://localhost:8080/api/2.1/unity-catalog"
SCHEMA = "unity.manage_models"
MODEL = f"{SCHEMA}.linear"
RENAMED = f"{SCHEMA}.linear_regression"
HAS_VERSIONS = "Unable to delete a registered model with existing model versions"


async def main() -> None:
    if url := os.environ.get("UC_BASE_URL"):
        assert url.rstrip("/") == UC_URL, url
    async with uc.ApiClient(uc.Configuration(host=UC_URL)) as admin:
        await _drop(admin)
        await _seed(admin)
        try:
            await _how_to()
        finally:
            await _drop(admin)


async def _seed(api) -> None:
    """The page's start state: a model with two ready versions."""
    await uc.SchemasApi(api).create_schema(
        uc.CreateSchema(name="manage_models", catalog_name="unity")
    )
    await uc.RegisteredModelsApi(api).create_registered_model(
        uc.CreateRegisteredModel(
            name="linear", catalog_name="unity", schema_name="manage_models"
        )
    )
    versions = uc.ModelVersionsApi(api)
    for _ in range(2):
        created = await versions.create_model_version(
            uc.CreateModelVersion(
                model_name="linear",
                catalog_name="unity",
                schema_name="manage_models",
                source="models:/m-0123456789abcdef0123456789abcdef",
            )
        )
        assert created.status == uc.ModelVersionStatus.PENDING_REGISTRATION, created
        await versions.finalize_model_version(
            full_name=MODEL,
            version=created.version,
            finalize_model_version=uc.FinalizeModelVersion(
                full_name=MODEL, version=created.version
            ),
        )


async def _how_to() -> None:
    # --8<-- [start:connect]
    from unitycatalog.client import (
        ApiClient,
        Configuration,
        ModelVersionsApi,
        RegisteredModelsApi,
        UpdateModelVersion,
        UpdateRegisteredModel,
    )

    api = ApiClient(Configuration(host="http://localhost:8080/api/2.1/unity-catalog"))
    models = RegisteredModelsApi(api)
    versions = ModelVersionsApi(api)
    # --8<-- [end:connect]
    try:
        # --8<-- [start:view]
        listed = await models.list_registered_models(
            catalog_name="unity", schema_name="manage_models"
        )
        for model in listed.registered_models:
            print(model.full_name, model.storage_location)

        listed = await versions.list_model_versions(
            full_name="unity.manage_models.linear"
        )
        for v in listed.model_versions:
            print(v.version, v.status.value, v.source)

        v = await versions.get_model_version(
            full_name="unity.manage_models.linear", version=1
        )
        print(v.status.value, v.storage_location)
        # --8<-- [end:view]
        await _check_view(models, versions, v)

        # --8<-- [start:update]
        await models.update_registered_model(
            full_name="unity.manage_models.linear",
            update_registered_model=UpdateRegisteredModel(
                comment="Predicts y from x with a linear fit"
            ),
        )
        await versions.update_model_version(
            full_name="unity.manage_models.linear",
            version=2,
            update_model_version=UpdateModelVersion(
                comment="Retrained on the new slope"
            ),
        )
        # --8<-- [end:update]
        before = await models.get_registered_model(full_name=MODEL)
        assert before.comment.startswith("Predicts"), before
        assert (
            await versions.get_model_version(full_name=MODEL, version=2)
        ).comment == ("Retrained on the new slope")
        assert not (
            await versions.get_model_version(full_name=MODEL, version=1)
        ).comment

        # --8<-- [start:rename]
        renamed = await models.update_registered_model(
            full_name="unity.manage_models.linear",
            update_registered_model=UpdateRegisteredModel(new_name="linear_regression"),
        )
        print(renamed.full_name)

        # Rename it back, so the steps below find it by its first name.
        await models.update_registered_model(
            full_name="unity.manage_models.linear_regression",
            update_registered_model=UpdateRegisteredModel(new_name="linear"),
        )
        # --8<-- [end:rename]
        await _check_renamed(models, versions, before, renamed)

        # --8<-- [start:delete-version]
        await versions.delete_model_version(
            full_name="unity.manage_models.linear", version=2
        )
        # --8<-- [end:delete-version]
        left = await versions.list_model_versions(full_name=MODEL)
        assert [v.version for v in left.model_versions] == [1], left
        await _check_needs_force(models)

        # --8<-- [start:delete-model]
        await models.delete_registered_model(
            full_name="unity.manage_models.linear", force=True
        )
        # --8<-- [end:delete-model]
        try:
            await models.get_registered_model(full_name=MODEL)
        except NotFoundException:
            pass
        else:
            raise AssertionError(f"{MODEL} still exists")

        # --8<-- [start:close]
        await api.close()
        # --8<-- [end:close]
        assert api.rest_client.pool_manager.closed
    finally:
        await api.close()  # a no-op after the region; closes on a failed run


async def _check_view(models, versions, v) -> None:
    listed = await models.list_registered_models(
        catalog_name="unity", schema_name="manage_models"
    )
    (model,) = listed.registered_models
    assert model.full_name == MODEL, model
    assert model.storage_location.startswith(
        "s3://amzn-s3-demo-bucket/unity/__unitystorage/"
    ), model
    listed = await versions.list_model_versions(full_name=MODEL)
    assert sorted(mv.version for mv in listed.model_versions) == [1, 2], listed
    assert v.status == uc.ModelVersionStatus.READY, v
    # A version's files sit under its model's directory.
    assert v.storage_location.startswith(model.storage_location + "/versions/"), v


async def _check_renamed(models, versions, before, renamed) -> None:
    """The rename took effect, and the model kept its id, storage, comment, and versions.

    After renaming back, the first name serves the same model and the second is free.
    """
    assert renamed.full_name == RENAMED, renamed
    keep = ("id", "storage_location", "comment")
    assert [getattr(renamed, k) for k in keep] == [getattr(before, k) for k in keep], (
        before,
        renamed,
    )
    after = await models.get_registered_model(full_name=MODEL)
    assert [getattr(after, k) for k in keep] == [getattr(before, k) for k in keep], (
        after
    )
    try:
        await models.get_registered_model(full_name=RENAMED)
    except NotFoundException:
        pass
    else:
        raise AssertionError(f"{RENAMED} still exists after renaming back")
    listed = await versions.list_model_versions(full_name=MODEL)
    assert sorted(v.version for v in listed.model_versions) == [1, 2], listed


async def _check_needs_force(models) -> None:
    """Without `force`, a model with versions can't be deleted."""
    try:
        await models.delete_registered_model(full_name=MODEL)
    except ApiException as exc:
        assert exc.status == 409 and HAS_VERSIONS in (exc.body or ""), exc
    else:
        raise AssertionError("deleted a model that still had versions")


async def _drop(api) -> None:
    """Remove what a failed run left behind; a passing run deleted the model."""
    for name in (MODEL, RENAMED):
        try:
            await uc.RegisteredModelsApi(api).delete_registered_model(
                full_name=name, force=True
            )
        except NotFoundException:
            pass
    try:
        await uc.SchemasApi(api).delete_schema(full_name=SCHEMA, force=True)
    except NotFoundException:
        pass


if __name__ == "__main__":
    asyncio.run(main())

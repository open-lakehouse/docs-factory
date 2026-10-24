#!/usr/bin/env bash
# View, update, rename, and delete registered models with the uc CLI.
#
# The CLI equivalents of models_sdk.py. With the uc-mlflow environment running
# and a model `unity.manage_models.linear` with versions 1 and 2 registered, it
# runs every step in order.

# --8<-- [start:setup]
uc() { docker exec unitycatalog bin/uc "$@"; }
# --8<-- [end:setup]

# --8<-- [start:view]
uc registered_model list --catalog unity --schema manage_models --output jsonPretty
uc model_version list --full_name unity.manage_models.linear --output jsonPretty
uc model_version get --full_name unity.manage_models.linear --version 1 --output jsonPretty
# --8<-- [end:view]

# --8<-- [start:update]
uc registered_model update --full_name unity.manage_models.linear \
  --comment "Predicts y from x with a linear fit"
uc model_version update --full_name unity.manage_models.linear --version 2 \
  --comment "Retrained on the new slope"
# --8<-- [end:update]

# --8<-- [start:rename]
uc registered_model update --full_name unity.manage_models.linear \
  --new_name linear_regression --output jsonPretty
# Rename it back, so the steps below find it by its first name.
uc registered_model update --full_name unity.manage_models.linear_regression \
  --new_name linear
# --8<-- [end:rename]

# --8<-- [start:delete-version]
uc model_version delete --full_name unity.manage_models.linear --version 2
# --8<-- [end:delete-version]

# Without --force, this fails while the model still has a version.
# --8<-- [start:try-delete]
uc registered_model delete --full_name unity.manage_models.linear
# --8<-- [end:try-delete]

# --8<-- [start:delete-model]
uc registered_model delete --full_name unity.manage_models.linear --force true
# --8<-- [end:delete-model]

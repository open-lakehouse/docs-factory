# /// script
# requires-python = ">=3.11"
# dependencies = ["docsnip"]
#
# [tool.uv.sources]
# docsnip = { path = "../../../../../tools/docsnip", editable = true }
#
# [tool.docs-factory]
# compose = "../compose.yaml"
# services = ["unitycatalog"]
# base-url-env = "UC_BASE_URL"
# ///
"""Run aws_storage.sh task by task and check what each command changed."""

import json
import os
from pathlib import Path

from docsnip.shellregions import get, run

HERE = Path(__file__).parent
SCRIPT = HERE / "aws_storage.sh"
BASE_URL = os.environ.get("UC_BASE_URL", "http://localhost:8080/api/2.1/unity-catalog")
MASTER = "arn:aws:iam::123456789012:role/uc-master"


def check_policies() -> None:
    """The page's IAM documents must parse and agree with server.properties."""
    trust = json.loads((HERE / "storage-role-trust.json").read_text())
    assert trust["Statement"][0]["Principal"]["AWS"] == MASTER
    assert "sts:ExternalId" in trust["Statement"][0]["Condition"]["StringEquals"]
    master = json.loads((HERE / "master-role-policy.json").read_text())
    assert master["Statement"][0]["Action"] == "sts:AssumeRole"
    actions = {
        a
        for s in json.loads((HERE / "storage-role-policy.json").read_text())[
            "Statement"
        ]
        for a in s["Action"]
    }
    assert {"s3:GetObject", "s3:PutObject", "s3:ListBucket"} <= actions, actions
    for name in ("server.properties", "server.aws.properties"):
        assert f"aws.masterRoleArn={MASTER}" in (HERE.parent / name).read_text()


if __name__ == "__main__":
    check_policies()
    run(SCRIPT, "prep")

    out = run(SCRIPT, "create-credential")
    cred = get(BASE_URL, "credentials/lake_storage")
    role = cred["aws_iam_role"]
    assert role["unity_catalog_iam_arn"] == MASTER, role
    assert role["external_id"] in out, out

    run(SCRIPT, "create-location")
    assert get(BASE_URL, "external-locations/lake")["credential_name"] == "lake_storage"

    vended = json.loads(run(SCRIPT, "verify").splitlines()[-1])
    assert vended["aws_temp_credentials"]["session_token"], vended

    assert "uc-storage-lake" in run(SCRIPT, "view")

    run(SCRIPT, "update-credential")
    rotated = get(BASE_URL, "credentials/lake_storage")["aws_iam_role"]
    # The page warns that a new role ARN comes with a new external ID.
    assert rotated["external_id"] != role["external_id"], rotated

    run(SCRIPT, "update-location")
    run(SCRIPT, "delete")
    assert (
        get(BASE_URL, "external-locations?max_results=100")["external_locations"] == []
    )

"""ADR-0008's model rules over a small model.json."""

from __future__ import annotations

import copy
import json

import pytest
from docsnip import model_rules


def _rel(kind, source, target, title=None, tags=None):
    rel = {"kind": kind, "source": {"model": source}, "target": {"model": target}}
    if title:
        rel["title"] = title
    if tags:
        rel["tags"] = tags
    return rel


# Conforms: an engine integrates a plugin that consumes a catalog spec, a server
# implements that spec and realizes what it specifies, and a deployment node is
# an instance of the server.
_MODEL = {
    "specification": {
        "elements": {
            "capability": {},
            "concern": {},
            "asset": {},
            "openSpecification": {},
            "implementation": {},
        },
        "relationships": {
            "specifies": {},
            "implements": {},
            "realizes": {},
            "integrates": {},
            "consumes": {},
            "registeredIn": {},
            "appliesTo": {},
        },
        "tags": {"public": {}, "designed": {}},
    },
    "elements": {
        "catalog": {"kind": "capability", "tags": ["public"]},
        "table": {"kind": "asset"},
        "gov": {"kind": "concern"},
        "gov.authz": {"kind": "concern"},
        "catSpec": {"kind": "openSpecification"},
        "server": {"kind": "implementation"},
        "engine": {"kind": "implementation"},
        "plugin": {"kind": "implementation"},
    },
    "relations": {
        "r1": _rel("specifies", "catSpec", "catalog"),
        "r2": _rel("implements", "server", "catSpec"),
        "r3": _rel("realizes", "server", "catalog"),
        "r4": _rel("integrates", "engine", "plugin"),
        "r5": _rel("consumes", "plugin", "catSpec", "resolves tables via"),
        "r6": _rel("registeredIn", "table", "catalog"),
        "r7": _rel("appliesTo", "gov.authz", "table", "grants access to"),
    },
    "deployments": {
        "elements": {"env.node.server": {"id": "env.node.server", "element": "server"}},
        "relations": {},
    },
    "views": {
        "techAll": {
            "nodes": [{"id": i} for i in ("catSpec", "server", "engine", "plugin")]
        }
    },
}


def _check(tmp_path, model) -> list[str]:
    path = tmp_path / "model.json"
    path.write_text(json.dumps(model))
    return model_rules.check(path)


def test_a_conforming_model_has_no_errors(tmp_path):
    assert _check(tmp_path, _MODEL) == []


def test_a_missing_model_reports_nothing(tmp_path):
    assert model_rules.check(tmp_path / "absent.json") == []


def _broken(edit):
    model = copy.deepcopy(_MODEL)
    edit(model)
    return model


@pytest.mark.parametrize(
    ("edit", "message"),
    [
        (
            lambda m: m["relations"].update(
                x=_rel("registeredIn", "server", "catalog")
            ),
            "`registeredIn` joins asset to capability, not implementation",
        ),
        (
            lambda m: m["relations"].update(x=_rel("dependsOn", "engine", "server")),
            "between implementations use `integrates`",
        ),
        (
            lambda m: m["relations"]["r3"].update(
                title="realizes the catalog capability"
            ),
            'the title "realizes the catalog capability" restates the kind',
        ),
        (
            lambda m: m["relations"].pop("r3"),
            "server implements catSpec, which specifies catalog, but doesn't realize catalog",
        ),
        (
            lambda m: m["relations"].update(x=_rel("appliesTo", "gov", "table")),
            "gov: a concern with facets carries no appliesTo of its own",
        ),
        (
            lambda m: m["elements"].update(catApi={"kind": "openSpecification"}),
            "catApi: a specification's id ends in `Spec`",
        ),
        (
            lambda m: m["deployments"]["elements"]["env.node.server"].update(
                element="catalog"
            ),
            "instanceOf catalog, a capability; a node is an instance of an implementation",
        ),
        (
            lambda m: m["specification"]["relationships"].update(partOf={}),
            "relationship kind `partOf` is declared but unused",
        ),
        (
            lambda m: m["specification"]["elements"].update(store={}),
            "element kind `store` is declared but unused",
        ),
        (
            lambda m: m["specification"]["tags"].update(optional={}),
            "tag `#optional` is declared but unused",
        ),
        (
            lambda m: m["views"]["techAll"]["nodes"].pop(),
            "plugin: in no technology area view",
        ),
    ],
)
def test_each_rule_reports_its_violation(tmp_path, edit, message):
    errors = _check(tmp_path, _broken(edit))
    assert any(message in e for e in errors), errors


def test_a_facet_realizes_its_parent_concern(tmp_path):
    def edit(m):
        m["relations"].update(
            s=_rel("specifies", "catSpec", "gov"),
            r=_rel("realizes", "server", "gov.authz"),
        )

    assert _check(tmp_path, _broken(edit)) == []

# /// script
# # 3.12: see tools.py; on 3.13.0-3.13.2 a function's error loses its traceback.
# requires-python = "==3.12.*"
# dependencies = [
#   "unitycatalog-ai==0.4.0",
#   "unitycatalog-langchain==0.4.0",
#   "langgraph-prebuilt==1.0.8",
# ]
#
# [tool.docs-factory]
# compose = "../../../../../envs/uc-mlflow/compose.yaml"
# services = ["unitycatalog", "mlflow"]
# base-url-env = "UC_BASE_URL"
# env = { EXECUTOR_MAX_MEMORY_LIMIT = "4096" }
# ///
"""Which parameter and return types survive each way an agent calls a tool.

Two paths, each with its own function client:

- ``invoke``: the toolkit's tool as built, ``tool.invoke(args)``. Its function
  serializes the arguments to JSON (``default=str``) before the client sees them.
- ``adapter``: the page's async adapter, ``tool.coroutine`` calling
  ``execute_function_async``, run with ``await tool.ainvoke(args)`` as an agent
  does. The arguments arrive as the tool schema parsed them.

Every function echoes its argument's Python type and value. ``CASES`` records
the outcome each path gives for each input; the run fails when any differs, so
the page's types callout fails CI when the toolkit changes. Prints the matrix.

No regions: the page states the results, it doesn't show this code.
"""

import asyncio
import datetime
import decimal
import json
import os

from unitycatalog.client.exceptions import NotFoundException

CATALOG, SCHEMA = "tooltypes", "echo"
ECHO = 'return f"{type(x).__name__}:{x!r}"'
NO_OUTPUT = "The function execution has completed, but no output was produced."


def _param(type_name, type_text, type_json_type, **extra):
    """An explicit parameter for types a Python type hint can't register."""
    return {
        "name": "x",
        "type_name": type_name,
        "type_text": type_text,
        "position": 0,
        "type_json": json.dumps(
            {"name": "x", "type": type_json_type, "nullable": False, "metadata": {}}
        ),
        "comment": "The value to echo.",
        **extra,
    }


def wrong_type(type_name, python_type, got):
    """The client's type-check error, as `.invoke` raises it."""
    return (
        f"Parameter x should be of type ColumnTypeName.{type_name} "
        f"(corresponding python type {python_type}), but got {got}"
    )


# Python-hinted echo functions, registered with create_python_function.
def echo_string(x: str) -> str:
    """Echo a value.

    Args:
        x: The value to echo.
    """
    return f"{type(x).__name__}:{x!r}"


def echo_long(x: int) -> str:
    """Echo a value.

    Args:
        x: The value to echo.
    """
    return f"{type(x).__name__}:{x!r}"


def echo_double(x: float) -> str:
    """Echo a value.

    Args:
        x: The value to echo.
    """
    return f"{type(x).__name__}:{x!r}"


def echo_boolean(x: bool) -> str:
    """Echo a value.

    Args:
        x: The value to echo.
    """
    return f"{type(x).__name__}:{x!r}"


def echo_date(x: datetime.date) -> str:
    """Echo a value.

    Args:
        x: The value to echo.
    """
    return f"{type(x).__name__}:{x!r}"


def echo_timestamp(x: datetime.datetime) -> str:
    """Echo a value.

    Args:
        x: The value to echo.
    """
    return f"{type(x).__name__}:{x!r}"


def echo_binary(x: bytes) -> str:
    """Echo a value.

    Args:
        x: The value to echo.
    """
    return f"{type(x).__name__}:{x!r}"


def echo_array(x: list[int]) -> str:
    """Echo a value.

    Args:
        x: The value to echo.
    """
    return f"{type(x).__name__}:{x!r}"


def echo_map(x: dict[str, int]) -> str:
    """Echo a value.

    Args:
        x: The value to echo.
    """
    return f"{type(x).__name__}:{x!r}"


def echo_decimal(x: decimal.Decimal) -> str:
    """Echo a value.

    Args:
        x: The value to echo.
    """
    return f"{type(x).__name__}:{x!r}"


def echo_interval(x: datetime.timedelta) -> str:
    """Echo a value.

    Args:
        x: The value to echo.
    """
    return f"{type(x).__name__}:{x!r}"


def echo_flag(x: bool = False) -> str:
    """Echo a value.

    Args:
        x: The value to echo.
    """
    return f"{type(x).__name__}:{x!r}"


def echo_flag_true(x: bool = True) -> str:
    """Echo a value.

    Args:
        x: The value to echo.
    """
    return f"{type(x).__name__}:{x!r}"


STRUCT = {
    "type": "struct",
    "fields": [
        {"name": "a", "type": "string", "nullable": True, "metadata": {}},
        {"name": "b", "type": "long", "nullable": True, "metadata": {}},
    ],
}


# (label, how to register, [(args, {"invoke": outcome, "adapter": outcome})]).
# An outcome is ("value", <tool result value>), ("error", <last line of the
# function's traceback>), or ("raises", "<ExceptionType>: <message substring>").
# Calls run in order on one client per path, so a later call sees the earlier
# call's cache.
def _cases():
    d = datetime.date(2026, 1, 2)
    ts = datetime.datetime(2026, 1, 2, 3, 4, 5)

    def same(outcome):
        return {"invoke": outcome, "adapter": outcome}

    def paths(invoke, adapter):
        return {"invoke": invoke, "adapter": adapter}

    def value(v):
        return ("value", v)

    def bad(type_name, python_type, got):
        return ("raises", "ValueError: " + wrong_type(type_name, python_type, got))

    unhashable_list = ("error", "TypeError: unhashable type: 'list'")
    unhashable_dict = ("error", "TypeError: unhashable type: 'dict'")
    struct_model = (
        "<class 'unitycatalog.ai.core.utils.function_processing_utils.Struct_"
    )
    return [
        ("STRING", echo_string, [({"x": "hi"}, same(value("str:'hi'")))]),
        (
            "BIGINT",
            echo_long,
            [({"x": 7}, same(value("int:7"))), ({"x": 7}, same(value("int:7")))],
        ),
        (
            "INT",
            ("echo_int", _param("INT", "INT", "integer")),
            [({"x": 7}, same(value("int:7"))), ({"x": 8}, same(value("int:8")))],
        ),
        # An int for a DOUBLE is converted by the tool schema on both paths.
        (
            "DOUBLE",
            echo_double,
            [
                ({"x": 2.5}, same(value("float:2.5"))),
                ({"x": 3}, same(value("float:3.0"))),
            ],
        ),
        ("BOOLEAN", echo_boolean, [({"x": True}, same(value("bool:True")))]),
        # A BOOLEAN default registers as its Python spelling, as text ("False",
        # "True"); omitting the argument fails either way.
        (
            "BOOLEAN default False",
            echo_flag,
            [
                ({}, same(bad("BOOLEAN", "<class 'bool'>", "<class 'str'>"))),
                ({"x": True}, same(value("bool:True"))),
            ],
        ),
        (
            "BOOLEAN default True",
            echo_flag_true,
            [
                ({}, same(bad("BOOLEAN", "<class 'bool'>", "<class 'str'>"))),
                ({"x": False}, same(value("bool:False"))),
            ],
        ),
        # A model sends JSON, so the string forms are what an agent passes.
        (
            "DATE",
            echo_date,
            [
                (
                    {"x": d},
                    paths(
                        bad("DATE", "<class 'datetime.date'>", "<class 'str'>"),
                        value("date:datetime.date(2026, 1, 2)"),
                    ),
                ),
                (
                    {"x": "2026-01-02"},
                    same(bad("DATE", "<class 'datetime.date'>", "<class 'str'>")),
                ),
            ],
        ),
        (
            "TIMESTAMP",
            echo_timestamp,
            [
                (
                    {"x": ts},
                    paths(
                        value("str:'2026-01-02 03:04:05'"),
                        value("datetime:datetime.datetime(2026, 1, 2, 3, 4, 5)"),
                    ),
                ),
                (
                    {"x": "2026-01-02T03:04:05"},
                    same(value("str:'2026-01-02T03:04:05'")),
                ),
            ],
        ),
        # Through the adapter a string becomes its UTF-8 bytes, not base64-decoded.
        (
            "BINARY",
            echo_binary,
            [
                (
                    {"x": b"ab"},
                    paths(
                        bad("BINARY", "<class 'bytes'>", "<class 'str'>"),
                        value("bytes:b'ab'"),
                    ),
                ),
                (
                    {"x": "YWI="},
                    paths(
                        bad("BINARY", "<class 'bytes'>", "<class 'str'>"),
                        value("bytes:b'YWI='"),
                    ),
                ),
            ],
        ),
        (
            "DECIMAL",
            (
                "echo_decimal",
                _param(
                    "DECIMAL",
                    "DECIMAL(10,2)",
                    "decimal(10,2)",
                    type_precision=10,
                    type_scale=2,
                ),
            ),
            [
                (
                    {"x": decimal.Decimal("1.25")},
                    paths(
                        bad("DECIMAL", "<class 'decimal.Decimal'>", "<class 'str'>"),
                        value("Decimal:Decimal('1.25')"),
                    ),
                ),
                (
                    {"x": 1.25},
                    same(
                        bad("DECIMAL", "<class 'decimal.Decimal'>", "<class 'float'>")
                    ),
                ),
                (
                    {"x": "1.25"},
                    paths(
                        bad("DECIMAL", "<class 'decimal.Decimal'>", "<class 'str'>"),
                        value("Decimal:Decimal('1.25')"),
                    ),
                ),
            ],
        ),
        (
            "INTERVAL",
            (
                "echo_interval",
                _param("INTERVAL", "INTERVAL DAY TO SECOND", "interval day to second"),
            ),
            [
                (
                    {"x": datetime.timedelta(days=1)},
                    paths(
                        bad(
                            "INTERVAL", "<class 'datetime.timedelta'>", "<class 'str'>"
                        ),
                        (
                            "raises",
                            "ValueError: Invalid interval type text: INTERVAL DAY TO SECOND, expecting 'interval day to second'",
                        ),
                    ),
                ),
                (
                    {"x": "P1D"},
                    same(
                        bad("INTERVAL", "<class 'datetime.timedelta'>", "<class 'str'>")
                    ),
                ),
            ],
        ),
        (
            "INTERVAL (lowercase type text)",
            (
                "echo_interval_lower",
                _param("INTERVAL", "interval day to second", "interval day to second"),
            ),
            [
                (
                    {"x": datetime.timedelta(days=1)},
                    paths(
                        bad(
                            "INTERVAL", "<class 'datetime.timedelta'>", "<class 'str'>"
                        ),
                        value("timedelta:datetime.timedelta(days=1)"),
                    ),
                ),
                (
                    {"x": "P1D"},
                    same(
                        bad("INTERVAL", "<class 'datetime.timedelta'>", "<class 'str'>")
                    ),
                ),
            ],
        ),
        # The first call works; every later call on the same client hits its lru_cache.
        (
            "ARRAY (hint)",
            echo_array,
            [
                ({"x": [1, 2]}, same(value("list:[1, 2]"))),
                ({"x": [3]}, same(unhashable_list)),
                ({"x": [4, 5]}, same(unhashable_list)),
            ],
        ),
        (
            "ARRAY<BIGINT>",
            (
                "echo_typed_array",
                _param(
                    "ARRAY",
                    "ARRAY<BIGINT>",
                    {"type": "array", "elementType": "long", "containsNull": True},
                ),
            ),
            [
                ({"x": [1, 2]}, same(value("list:[1, 2]"))),
                ({"x": [3]}, same(unhashable_list)),
                ({"x": [4, 5]}, same(unhashable_list)),
            ],
        ),
        (
            "MAP (hint)",
            echo_map,
            [
                ({"x": {"a": 1}}, same(value("dict:{'a': 1}"))),
                ({"x": {"b": 2}}, same(unhashable_dict)),
                ({"x": {"c": 3}}, same(unhashable_dict)),
            ],
        ),
        (
            "STRUCT",
            ("echo_struct", _param("STRUCT", "STRUCT<a: STRING, b: BIGINT>", STRUCT)),
            [
                (
                    {"x": {"a": "z", "b": 2}},
                    paths(
                        bad("STRUCT", "<class 'dict'>", "<class 'str'>"),
                        (
                            "raises",
                            "ValueError: "
                            + wrong_type("STRUCT", "<class 'dict'>", struct_model),
                        ),
                    ),
                ),
            ],
        ),
    ]


RETURNS = [
    ("DATE", "import datetime\nreturn datetime.date(2026, 1, 2)"),
    ("TIMESTAMP", "import datetime\nreturn datetime.datetime(2026, 1, 2)"),
    ("DECIMAL", "import decimal\nreturn decimal.Decimal('1.25')"),
    ("BINARY", "return b'ab'"),
    ("ARRAY", "return [1, 2]"),
    ("MAP", "return {'a': 1}"),
    ("STRUCT", "return {'a': 'z', 'b': 2}"),
    ("BOOLEAN", "return True"),
    ("DOUBLE", "return 0.5"),
    ("LONG", "return 0"),
    ("BOOLEAN", "return False"),
    ("STRING", "return ''"),
    ("STRING", "return None"),
    ("ARRAY", "return []"),
    ("MAP", "return {}"),
]


def _adapt(tool, client):
    """The page's async adapter (region `async-tools` in tools.py)."""

    async def run(**arguments):
        result = await client.execute_function_async(
            tool.uc_function_name, parameters=arguments
        )
        return result.to_json()

    tool.coroutine = run
    return tool


async def _outcome(tool, args, path):
    try:
        raw = tool.invoke(args) if path == "invoke" else await tool.ainvoke(args)
    except Exception as exc:
        return ("raises", f"{type(exc).__name__}: {exc}")
    result = json.loads(raw)
    if "error" in result:
        return ("error", result["error"].strip().splitlines()[-1])
    return ("value", result["value"])


def _matches(observed, expected):
    kind, detail = observed
    if kind != expected[0]:
        return False
    want = expected[1]
    if kind == "raises":  # same exception type, message contains the expected text
        exc_type, message = want.split(": ", 1)
        return detail.startswith(exc_type + ": ") and message in detail
    if isinstance(want, str) and want.endswith("..."):  # a prefix
        return isinstance(detail, str) and detail.startswith(want[:-3])
    return detail == want


async def main() -> None:
    from unitycatalog.ai.core.client import (
        UnitycatalogClient,
        UnitycatalogFunctionClient,
    )
    from unitycatalog.ai.langchain.toolkit import UCFunctionToolkit
    from unitycatalog.client import ApiClient, CatalogsApi, Configuration

    config = Configuration(host="http://localhost:8080/api/2.1/unity-catalog")
    if url := os.environ.get("UC_BASE_URL"):
        config.host = url
    api = ApiClient(config)
    clients = {
        "invoke": UnitycatalogFunctionClient(api_client=api),
        "adapter": UnitycatalogFunctionClient(api_client=api),
    }
    admin = clients["invoke"]

    def tool_for(name, path):
        tool = UCFunctionToolkit(function_names=[name], client=clients[path]).tools[0]
        return tool if path == "invoke" else _adapt(tool, clients[path])

    failures, matrix = [], []
    try:
        try:
            await CatalogsApi(api).delete_catalog(name=CATALOG, force=True)
        except NotFoundException:
            pass
        uc = UnitycatalogClient(api_client=api)
        await uc.create_catalog_async(name=CATALOG)
        await uc.create_schema_async(name=SCHEMA, catalog_name=CATALOG)

        # DECIMAL and INTERVAL type hints can't be registered at all.
        for func in (echo_decimal, echo_interval):
            try:
                await admin.create_python_function_async(
                    func=func, catalog=CATALOG, schema=SCHEMA
                )
            except (
                Exception
            ) as exc:  # pydantic ValidationError on FunctionParameterInfo
                assert "type_name" in str(exc) and "Input should be 'BOOLEAN'" in str(
                    exc
                ), exc
            else:
                raise AssertionError(f"{func.__name__} should fail to register")

        for label, how, calls in CASES:
            if callable(how):
                await admin.create_python_function_async(
                    func=how, catalog=CATALOG, schema=SCHEMA
                )
                name = f"{CATALOG}.{SCHEMA}.{how.__name__}"
            else:
                name = f"{CATALOG}.{SCHEMA}.{how[0]}"
                await admin.create_function_async(
                    function_name=name,
                    routine_definition=ECHO,
                    data_type="STRING",
                    full_data_type="STRING",
                    comment="Echo a value.",
                    parameters=[how[1]],
                )
            tools = {path: tool_for(name, path) for path in clients}
            for args, expected in calls:
                row = {"type": label, "args": repr(args)}
                for path, tool in tools.items():
                    observed = await _outcome(tool, args, path)
                    row[path] = observed
                    if expected is None or not _matches(observed, expected[path]):
                        failures.append(
                            (label, args, path, observed, expected and expected[path])
                        )
                matrix.append(row)

        for i, (data_type, body) in enumerate(RETURNS):
            name = f"{CATALOG}.{SCHEMA}.ret_{i}"
            await admin.create_function_async(
                function_name=name,
                routine_definition=body,
                data_type=data_type,
                full_data_type=data_type,
                comment="Return a value.",
                parameters=[],
            )
            row = {"type": f"returns {data_type}", "args": body.splitlines()[-1]}
            for path in clients:
                row[path] = await _outcome(tool_for(name, path), {}, path)
            matrix.append(row)
            expected = RETURN_EXPECTED[i] if RETURN_EXPECTED else None
            for path in clients:
                if expected is None or not _matches(row[path], expected):
                    failures.append(
                        (row["type"], row["args"], path, row[path], expected)
                    )

        _schema_checks(tool_for)
        await CatalogsApi(api).delete_catalog(name=CATALOG, force=True)
    finally:
        await api.close()
    for row in matrix:
        print(json.dumps(row, default=str))
    assert not failures, "\n".join(map(repr, failures))


def _schema_checks(tool_for) -> None:
    """What the model is told, per type: the tool's JSON schema for `x`."""
    from pydantic import ValidationError

    def x(fname):
        return tool_for(f"{CATALOG}.{SCHEMA}.{fname}", "invoke").args["x"]

    assert x("echo_long")["type"] == "integer"
    assert x("echo_double")["type"] == "number"
    assert x("echo_boolean")["type"] == "boolean"
    assert x("echo_date")["anyOf"][0] == {"format": "date", "type": "string"}
    # Registered from a hint, an array or map loses its element type.
    assert x("echo_array") == {**x("echo_array"), "type": "array", "items": {}}
    assert (
        x("echo_map")["type"] == "object"
        and x("echo_map")["additionalProperties"] is True
    )
    assert x("echo_typed_array")["items"] == {
        "anyOf": [{"type": "integer"}, {"type": "null"}]
    }
    # A BOOLEAN default registers as text: "False", "True".
    assert x("echo_flag")["default"] == "False"
    assert x("echo_flag_true")["default"] == "True"
    # A value the schema can't coerce never reaches the client, on either path.
    try:
        tool_for(f"{CATALOG}.{SCHEMA}.echo_long", "invoke").invoke({"x": "seven"})
    except ValidationError as exc:
        assert "Input should be a valid integer" in str(exc), exc
    else:
        raise AssertionError("a string for a LONG parameter should be rejected")


def _return_expected():
    def not_json(type_name):
        return (
            "raises",
            f"TypeError: Object of type {type_name} is not JSON serializable",
        )

    no_output = ("value", NO_OUTPUT + "...")
    # Same outcome on both paths: both serialize the result with `to_json()`.
    return [
        not_json("date"),
        not_json("datetime"),
        not_json("Decimal"),
        not_json("bytes"),
        ("value", [1, 2]),
        ("value", {"a": 1}),
        ("value", {"a": "z", "b": 2}),
        ("value", True),
        ("value", 0.5),
        *[no_output] * 6,  # 0, False, "", None, [], {}
    ]


RETURN_EXPECTED = _return_expected()
CASES = _cases()

if __name__ == "__main__":
    asyncio.run(main())

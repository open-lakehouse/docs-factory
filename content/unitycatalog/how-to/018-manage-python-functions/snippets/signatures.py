# /// script
# requires-python = "==3.12.*"
# dependencies = ["unitycatalog-ai==0.4.0"]
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# base-url-env = "UC_BASE_URL"
# env = { EXECUTOR_MAX_MEMORY_LIMIT = "4096" }
# ///
# The old typing forms (Optional, Union, List) are under test; keep them.
# ruff: noqa: UP006, UP007, UP035, UP045
"""Which Python signatures and docstrings the catalog can store.

Evidence for the page's type-hint table and docstring rules: no regions, every
behavior is an assert. Registers each function and reads back the SQL types the
server stored; the rejections fail in the client, before any request.

Start the docs' local server from `uc-docs-env/unitycatalog`:

    docker compose up -d --wait

Then run this script:

    uv run signatures.py
"""

import asyncio
import datetime
import decimal
import math
import os
import warnings
from typing import Any, List, Optional, Union

from unitycatalog.ai.core.client import UnitycatalogFunctionClient
from unitycatalog.client import (
    ApiClient,
    CatalogsApi,
    Configuration,
    CreateCatalog,
    CreateSchema,
    SchemasApi,
)
from unitycatalog.client.exceptions import NotFoundException

CATALOG, SCHEMA = "h11_signatures", "s"


def every_type(
    a: int,
    b: float,
    c: str,
    d: bool,
    e: datetime.date,
    f: datetime.datetime,
    g: bytes,
    h: list[int],
    i: dict[str, int],
    j: list,
    k: dict,
    m: Optional[int] = None,
) -> str:
    """Take one parameter of each supported type.

    Args:
        a: int
        b: float
        c: str
        d: bool
        e: date
        f: datetime
        g: bytes
        h: list of int
        i: dict of str to int
        j: bare list
        k: bare dict
        m: optional int
    """
    return "ok"


def optional_defaults(
    no_default: Optional[int],
    none_default: Optional[int] = None,
    seven: Optional[int] = 7,
) -> int:
    """Optional parameters with no default, a None default, and a value default.

    Args:
        no_default: Optional with no default.
        none_default: Optional defaulting to None.
        seven: Optional defaulting to 7.
    """
    return 1


def two_paragraphs(x: int) -> int:
    """First paragraph.

    Second paragraph.

    Args:
        x: x
    """
    return x


def returns_list(x: int) -> list[str]:
    """Return a list.

    Args:
        x: x
    """
    return [str(x)]


def uses_union(x: Union[int, str]) -> int:
    """Union.

    Args:
        x: x
    """
    return 1


def uses_pipe_none(x: int | None = None) -> int:
    """PEP 604 optional.

    Args:
        x: x
    """
    return 1


def uses_any(x: Any) -> int:
    """Any.

    Args:
        x: x
    """
    return 1


def uses_typing_list(x: List) -> int:
    """typing.List with no element type.

    Args:
        x: x
    """
    return 1


def uses_args(*args: int) -> int:
    """Var-positional.

    Args:
        args: values
    """
    return 1


def uses_kwargs(**kwargs: int) -> int:
    """Var-keyword.

    Args:
        kwargs: values
    """
    return 1


def no_return_hint(x: int):
    """No return hint.

    Args:
        x: x
    """
    return x


def no_param_hint(x) -> int:
    """No parameter hint.

    Args:
        x: x
    """
    return x


def no_docstring(x: int) -> int:
    return x


def only_args(x: int) -> int:
    """
    Args:
        x: x
    """
    return x


def module_import(weight_kg: float) -> int:
    """Use a module imported at the top of this file.

    Args:
        weight_kg: Weight in kilograms.
    """
    return math.ceil(weight_kg)


def inner_import(weight_kg: float) -> int:
    """Import the module inside the body.

    Args:
        weight_kg: Weight in kilograms.
    """
    import math

    return math.ceil(weight_kg)


def uses_decimal(x: decimal.Decimal) -> int:
    """Decimal.

    Args:
        x: x
    """
    return 1


def mismatched_docstring(quantity: int) -> int:
    """Docstring names a parameter the signature doesn't have.

    Args:
        qty: Number of units.
    """
    return quantity


async def main() -> None:
    config = Configuration(host="http://localhost:8080/api/2.1/unity-catalog")
    if url := os.environ.get("UC_BASE_URL"):
        config.host = url
    api = ApiClient(config)
    client = UnitycatalogFunctionClient(api_client=api)
    try:
        await _seed(api)

        async def register(func):
            return await client.create_python_function_async(
                func=func, catalog=CATALOG, schema=SCHEMA
            )

        # Python type -> stored SQL type, read back from the server.
        await register(every_type)
        fn = await client.get_function_async(f"{CATALOG}.{SCHEMA}.every_type")
        stored = [
            (p.name, p.type_text, p.parameter_default)
            for p in fn.input_params.parameters
        ]
        assert stored == [
            ("a", "LONG", None),
            ("b", "DOUBLE", None),
            ("c", "STRING", None),
            ("d", "BOOLEAN", None),
            ("e", "DATE", None),
            ("f", "TIMESTAMP", None),
            ("g", "BINARY", None),
            ("h", "ARRAY<LONG>", None),
            ("i", "MAP<STRING, LONG>", None),
            # Built-in list and dict without element types are accepted.
            ("j", "ARRAY", None),
            ("k", "MAP", None),
            # Optional[T] = None is stored as T with a NULL default.
            ("m", "LONG", "NULL"),
        ], stored
        assert fn.full_data_type == "STRING"
        # The docstring's description is the comment, each Args: entry a
        # parameter comment.
        assert fn.comment == "Take one parameter of each supported type."
        assert fn.input_params.parameters[7].comment == "list of int"

        # Optional[T] is stored as T. Only a Python default becomes a stored
        # default: none for no default, "NULL" for None, the value's text else.
        await register(optional_defaults)
        fn = await client.get_function_async(f"{CATALOG}.{SCHEMA}.optional_defaults")
        stored = [
            (p.name, p.type_text, p.parameter_default)
            for p in fn.input_params.parameters
        ]
        assert stored == [
            ("no_default", "LONG", None),
            ("none_default", "LONG", "NULL"),
            ("seven", "LONG", "7"),
        ], stored

        # Every paragraph before Args: is the description, joined with a space.
        info = await register(two_paragraphs)
        assert info.comment == "First paragraph. Second paragraph.", info.comment

        info = await register(returns_list)
        assert info.full_data_type == "ARRAY<STRING>" and info.data_type == "ARRAY"

        # Rejected in the client, before any request.
        rejected = {
            uses_union: "Error in parameter 'x': type typing.Union[int, str] is not supported. "
            "Original error: Unsupported type union: typing.Union[int, str]",
            uses_any: "Error in parameter 'x': type typing.Any is not supported. "
            "Original error: Unsupported Python type: typing.Any is not allowed. "
            "Please specify a concrete type.",
            uses_typing_list: "Error in parameter 'x': List type requires a specific "
            "element type. Please define the internal type for the list, e.g., "
            "List[int]. Original error: Unsupported Python type: typing.List or "
            "typing.Tuple requires an element type.",
            uses_args: "Parameter 'args' is a var-positional (*args) parameter, which "
            "is not supported in SQL functions.",
            uses_kwargs: "Parameter 'kwargs' is a var-keyword (**kwargs) parameter, "
            "which is not supported in SQL functions.",
            no_return_hint: "Return type for function 'no_return_hint' is not defined. "
            "Please provide a return type.",
            no_param_hint: "Missing type hint for parameter: x.",
            no_docstring: "Function 'no_docstring' must have a docstring with a "
            "description.",
            only_args: "Function description is missing in the docstring. Please "
            "provide a function description.",
        }
        for func, message in rejected.items():
            try:
                await register(func)
            except ValueError as exc:
                assert str(exc) == message, (func.__name__, str(exc))
            else:
                raise AssertionError(f"{func.__name__} should be rejected")

        # `X | None` is rejected too (unlike Optional[X]).
        try:
            await register(uses_pipe_none)
        except ValueError as exc:
            assert "type int | None is not supported" in str(exc), exc
        else:
            raise AssertionError("int | None should be rejected")

        # Decimal maps to DECIMAL(38, 18), which the client's own parameter
        # model then refuses: it fails, though not with a ValueError message.
        from pydantic import ValidationError

        try:
            await register(uses_decimal)
        except ValidationError as exc:
            assert "DECIMAL(38, 18)" in str(exc), exc
        else:
            raise AssertionError("Decimal should fail")

        # A docstring that disagrees with the signature only warns.
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            info = await register(mismatched_docstring)
        messages = [str(w.message) for w in caught if w.category is UserWarning]
        assert any(
            "documented in the docstring but not present in the function signature: qty"
            in m
            for m in messages
        ), messages
        assert any(
            "present in the function signature but not documented in the docstring: "
            "quantity" in m
            for m in messages
        ), messages
        assert info.input_params.parameters[0].comment is None

        # Only the body is stored: a module-level import doesn't travel with it.
        local = UnitycatalogFunctionClient(api_client=api, execution_mode="local")
        for func in (module_import, inner_import):
            info = await register(func)
            assert "def " not in info.routine_definition, info.routine_definition
        name = f"{CATALOG}.{SCHEMA}.module_import"
        params = {"weight_kg": 2.5}
        result = await local.execute_function_async(name, parameters=params)
        assert result.error == "name 'math' is not defined", result
        result = await client.execute_function_async(name, parameters=params)
        assert result.value is None and (
            "NameError: name 'math' is not defined" in result.error
        ), result
        result = await client.execute_function_async(
            f"{CATALOG}.{SCHEMA}.inner_import", parameters=params
        )
        assert result.error is None and result.value == 3, result

        # The client reads the source with inspect: a function without source
        # on disk (built with exec, or typed into a REPL that keeps no source)
        # can't be registered.
        namespace: dict = {}
        exec(
            'def no_source(x: int) -> int:\n    """No source."""\n    return x\n',
            namespace,
        )
        try:
            await register(namespace["no_source"])
        except OSError as exc:
            assert str(exc) == "could not get source code", exc
        else:
            raise AssertionError("a function with no source should be rejected")

        await CatalogsApi(api).delete_catalog(name=CATALOG, force=True)
    finally:
        await api.close()


async def _seed(api) -> None:
    catalogs = CatalogsApi(api)
    try:
        await catalogs.delete_catalog(name=CATALOG, force=True)
    except NotFoundException:
        pass
    await catalogs.create_catalog(CreateCatalog(name=CATALOG))
    await SchemasApi(api).create_schema(CreateSchema(name=SCHEMA, catalog_name=CATALOG))


if __name__ == "__main__":
    asyncio.run(main())

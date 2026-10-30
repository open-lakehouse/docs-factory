# /// script
# # 3.12, matching the functions pages: on 3.14 the unitycatalog-ai client's
# # nest_asyncio crashes asyncio.run at exit (see R01).
# requires-python = "==3.12.*"
# # numpy: DuckDB's create_function needs it.
# dependencies = ["duckdb==2.0.0", "unitycatalog-ai==0.4.0", "numpy>=2"]
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# base-url-env = "UC_BASE_URL"
# claims.duckdb-sql = [
#   { journey = "function.execute", fails = "Scalar Function with name order_total does not exist!", note = "SELECT on the catalog name after ATTACH" },
#   { journey = "function.list", fails = true, note = "duckdb_functions() lists none of the catalog's functions" },
#   { journey = "function.create", fails = "UC databases do not support creating functions", note = "CREATE FUNCTION and CREATE MACRO" },
#   { journey = "function.delete", fails = "Macro Function with name order_total does not exist!", note = "DROP FUNCTION" },
# ]
# ///
"""Show that DuckDB can't resolve Unity Catalog functions, and pin the errors.

The page shows no DuckDB code. This script backs the DuckDB cells of the
functions compatibility table and the R01 row. DuckDB's `unity_catalog`
extension serves the tables and views in an attached catalog, not its
functions: a function name on the catalog fails to bind, and
`duckdb_functions()` lists none of them. The script prints the DuckDB and
extension versions it ran.

It also pins a workaround the page doesn't show: fetch the function with
unitycatalog-ai and register it with the connection's `create_function`, as
the page does with `spark.udf.register`.

Start the docs' local server from `uc-docs-env/unitycatalog`:

    docker compose up -d --wait

Then run this script beside `seed.py`:

    uv run duckdb_functions.py
"""

import asyncio
import os
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

HOST = "http://localhost:8080/api/2.1/unity-catalog"
URL = os.environ.get("UC_BASE_URL", HOST)
ENDPOINT = URL.split("/api/")[0]
BUILDS = {
    "core": "INSTALL unity_catalog",
}
# The first line of each error. DuckDB appends a "Did you mean" suggestion on
# the next line, which changes with the functions it has loaded.
NO_ORDER_TOTAL = "Catalog Error: Scalar Function with name order_total does not exist!"
NO_DOUBLE_IT = "Catalog Error: Scalar Function with name double_it does not exist!"
NO_MACRO = "Catalog Error: Macro Function with name order_total does not exist!"
NO_CREATE = "Binder Error: UC databases do not support creating functions"


def main() -> None:
    _with_api("register_all")
    try:
        for build in BUILDS:
            # One process per build: a process loads one unity_catalog build.
            run = subprocess.run(
                [sys.executable, __file__, build],
                capture_output=True,
                text=True,
                timeout=300,
            )
            print(run.stdout, end="")
            assert run.returncode == 0, (build, run.stdout, run.stderr[-2000:])
            assert f"unity_catalog installed_from={build} " in run.stdout, run.stdout
    finally:
        _with_api("drop_all")


def check_build(build: str) -> None:
    import duckdb

    con = duckdb.connect(config={"extension_directory": tempfile.mkdtemp()})
    for statement in (
        "INSTALL delta",
        "LOAD delta",
        BUILDS[build],
        "LOAD unity_catalog",
        f"CREATE SECRET (TYPE unity_catalog, TOKEN 'not-used', ENDPOINT '{ENDPOINT}')",
        "ATTACH 'tools' AS tools (TYPE unity_catalog, DEFAULT_SCHEMA 'pricing')",
    ):
        con.execute(statement)
    [(version, installed_from)] = con.sql(
        "SELECT extension_version, installed_from FROM duckdb_extensions() "
        "WHERE extension_name = 'unity_catalog'"
    ).fetchall()
    print(
        f"duckdb={duckdb.__version__} unity_catalog installed_from={installed_from} "
        f"extension_version={version}"
    )
    assert installed_from == build, installed_from

    # The attach worked: the schema is there.
    schemas = con.sql(
        "SELECT schema_name FROM duckdb_schemas() WHERE database_name = 'tools'"
    ).fetchall()
    assert ("pricing",) in schemas, schemas

    # Calling a catalog function by name: fully qualified, schema-qualified,
    # and bare after USE. A Python function and a SQL-body function fail alike.
    calls = {
        "SELECT tools.pricing.order_total(3, 19.99, 10.0)": NO_ORDER_TOTAL,
        "SELECT tools.pricing.double_it(3)": NO_DOUBLE_IT,
        "SELECT pricing.order_total(3, 19.99, 10.0)": NO_ORDER_TOTAL,
    }
    for sql, expected in calls.items():
        _raises(con, sql, duckdb.CatalogException, expected)
    con.execute("USE tools.pricing")
    _raises(
        con,
        "SELECT order_total(3, 19.99, 10.0)",
        duckdb.CatalogException,
        NO_ORDER_TOTAL,
    )
    con.execute("USE memory.main")

    # Listing: duckdb_functions() has no entry from the catalog, by name or by
    # database. The extension adds no function of its own that lists them.
    listed = con.sql(
        "SELECT database_name, schema_name, function_name FROM duckdb_functions() "
        "WHERE database_name = 'tools' "
        "OR function_name IN ('order_total', 'process_id', 'has_unitycatalog', 'double_it')"
    ).fetchall()
    assert listed == [], listed
    extension_functions = sorted(
        r[0]
        for r in con.sql(
            "SELECT DISTINCT function_name FROM duckdb_functions() "
            "WHERE function_name ILIKE '%unity%' OR function_name ILIKE 'uc\\_%' ESCAPE '\\'"
        ).fetchall()
    )
    assert extension_functions == [
        "uc_read_deletion_vector",
        "unity_catalog_checkpoint_table",
        "unity_catalog_force_checkpoint_table",
    ], extension_functions

    # Creating or dropping one in the attached catalog.
    for sql in (
        "CREATE FUNCTION tools.pricing.y(x) AS x * 2",
        "CREATE MACRO tools.pricing.y(x) AS x * 2",
    ):
        _raises(con, sql, duckdb.BinderException, NO_CREATE)
    for sql in (
        "DROP FUNCTION tools.pricing.order_total",
        "DROP MACRO tools.pricing.order_total",
    ):
        _raises(con, sql, duckdb.CatalogException, NO_MACRO)

    _workaround(con)


def _workaround(con) -> None:
    """Fetch the function and register it with create_function."""
    import duckdb
    from unitycatalog.ai.core.client import UnitycatalogFunctionClient
    from unitycatalog.client import ApiClient, Configuration

    async def connect():
        return UnitycatalogFunctionClient(api_client=ApiClient(Configuration(host=URL)))

    client = asyncio.run(connect())
    name = "tools.pricing.order_total"
    order_total = client.get_function_as_callable(name, register_function=False)
    # The callable carries the catalog signature as annotations, so DuckDB
    # infers BIGINT, DOUBLE, DOUBLE -> DOUBLE.
    con.create_function("order_total", order_total)
    assert con.sql("SELECT order_total(3, 19.99, 10.0)").fetchall() == [(53.97,)]
    rows = con.sql(
        "SELECT order_total(q, p, d) FROM "
        "(VALUES (3, 19.99, 10.0), (1, 5.0, 0.0)) t(q, p, d)"
    ).fetchall()
    assert rows == [(53.97,), (5.0,)], rows
    # It's a session function in system.main, not one in the attached catalog.
    where = con.sql(
        "SELECT database_name, schema_name, function_type FROM duckdb_functions() "
        "WHERE function_name = 'order_total'"
    ).fetchall()
    assert where == [("system", "main", "scalar")], where
    _raises(
        con,
        "SELECT tools.pricing.order_total(3, 19.99, 10.0)",
        duckdb.BinderException,
        'Binder Error: Referenced table "tools" not found!',
    )
    # The Python default for discount_pct doesn't carry over: all three
    # arguments are required.
    _raises(
        con,
        "SELECT order_total(3, 19.99)",
        duckdb.BinderException,
        "Binder Error: No function matches the given name and argument types "
        "'order_total(INTEGER_LITERAL, DECIMAL(4,2))'.",
    )
    con.remove_function("order_total")
    asyncio.run(client.close_async())
    print("workaround: create_function(get_function_as_callable(...)) works")


def _raises(con, sql: str, error: type, first_line: str) -> None:
    try:
        con.sql(sql).fetchall()
    except Exception as err:  # noqa: BLE001
        message = str(err)
        print(f"{sql}\n  -> {type(err).__name__}: {message!r}")
        assert type(err) is error, (sql, type(err), message)
        assert message.split("\n")[0].startswith(first_line), (sql, message)
        return
    raise AssertionError(f"now supported, update the compatibility claims: {sql}")


def _with_api(step: str) -> None:
    """Run one of seed.py's steps on a connection of its own."""
    from unitycatalog.client import ApiClient, Configuration

    import seed

    async def go():
        api = ApiClient(Configuration(host=URL))
        try:
            await getattr(seed, step)(api)
        finally:
            await api.close()

    asyncio.run(go())


if __name__ == "__main__":
    if len(sys.argv) > 1:
        check_build(sys.argv[1])
    else:
        main()

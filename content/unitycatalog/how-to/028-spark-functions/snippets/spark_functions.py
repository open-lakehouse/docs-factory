# /// script
# # 3.12, matching the functions pages: on 3.13.0-3.13.2 the unitycatalog-ai
# # sandbox loses tracebacks, and on 3.14 the client's nest_asyncio crashes
# # asyncio.run at exit (see R01).
# requires-python = "==3.12.*"
# dependencies = ["pyspark==4.1.0", "unitycatalog-ai==0.4.0"]
#
# [tool.docs-factory]
# compose = "../../../../../envs/unitycatalog/compose.yaml"
# services = ["unitycatalog"]
# base-url-env = "UC_BASE_URL"
# lane = "spark"
# claims.spark-python = [
#   { journey = "function.engine-udf", region = "register", api = "get_function_as_callable + spark.udf.register" },
#   { journey = "function.execute", fails = "MISSING_CATALOG_ABILITY.FUNCTIONS", note = "call_function on the catalog name" },
#   { journey = "function.list", fails = "MISSING_CATALOG_ABILITY.FUNCTIONS", note = "spark.catalog.listFunctions" },
#   { journey = "function.describe", fails = "MISSING_CATALOG_ABILITY.FUNCTIONS", note = "spark.catalog.getFunction" },
# ]
# claims.spark-sql = [
#   { journey = "function.execute", fails = "MISSING_CATALOG_ABILITY.FUNCTIONS", note = "SELECT on the catalog name" },
#   { journey = "function.create", fails = "MISSING_CATALOG_ABILITY.CREATE_FUNCTION", note = "CREATE FUNCTION of any kind: a SQL body and a JVM class both fail" },
#   { journey = "function.list", fails = "MISSING_CATALOG_ABILITY.FUNCTIONS", note = "SHOW FUNCTIONS" },
#   { journey = "function.describe", fails = "MISSING_CATALOG_ABILITY.FUNCTIONS", note = "DESCRIBE FUNCTION" },
#   { journey = "function.delete", fails = "MISSING_CATALOG_ABILITY.FUNCTIONS", note = "DROP FUNCTION" },
# ]
# ///
"""Run a catalog function in Spark as a session UDF.

The Unity Catalog connector resolves tables, not functions, so the script
fetches a registered Python function with unitycatalog-ai and registers it as
a Spark UDF. The asserts around the regions pin what Spark does with catalog
function names, where the UDF runs, and how the session copy behaves when the
catalog changes.

Start the docs' local server from `uc-docs-env/unitycatalog`:

    docker compose up -d --wait

Then run this script beside `seed.py`:

    uv run spark_functions.py

Needs Java 17 and Maven access on first run. Behind a Maven mirror, export
PYSPARK_SUBMIT_ARGS="--repositories <mirror-url> pyspark-shell" first.
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
NAME = "tools.pricing.order_total"


def main() -> None:
    _with_api("register_all")
    # The regions connect to the documented host; the harness serves there.
    assert URL.rstrip("/") == HOST, URL

    # --8<-- [start:session]
    from pyspark.sql import SparkSession

    UC_SPARK = "io.unitycatalog:unitycatalog-spark_4.1_2.13:0.7.0"
    DELTA_SPARK = "io.delta:delta-spark_4.1_2.13:4.3.1"

    spark = (
        SparkSession.builder.appName("uc-spark")
        .config("spark.jars.packages", f"{UC_SPARK},{DELTA_SPARK}")
        .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
        .config(
            "spark.sql.catalog.spark_catalog",
            "org.apache.spark.sql.delta.catalog.DeltaCatalog",
        )
        .config("spark.sql.catalog.unity", "io.unitycatalog.spark.UCSingleCatalog")
        .config("spark.sql.catalog.unity.uri", "http://localhost:8080")
        .config("spark.sql.catalog.unity.auth.type", "static")
        .config("spark.sql.catalog.unity.auth.token", "not-used")
        .config("spark.sql.defaultCatalog", "unity")
        .getOrCreate()
    )
    # --8<-- [end:session]
    spark.sparkContext.setLogLevel("FATAL")

    _native_resolution_fails(spark, catalog="unity")
    # With the function's catalog configured too, as for reading its tables,
    # the same calls fail on that catalog instead.
    _configure_catalog(spark, "tools")
    _native_resolution_fails(spark, catalog="tools")

    # --8<-- [start:connect]
    import asyncio

    from unitycatalog.ai.core.client import UnitycatalogFunctionClient
    from unitycatalog.client import ApiClient, Configuration

    async def connect():
        config = Configuration(host="http://localhost:8080/api/2.1/unity-catalog")
        return UnitycatalogFunctionClient(api_client=ApiClient(config))

    client = asyncio.run(connect())
    # --8<-- [end:connect]

    # --8<-- [start:register]
    name = "tools.pricing.order_total"
    order_total = client.get_function_as_callable(name, register_function=False)
    return_type = client.get_function(name).full_data_type  # "DOUBLE"
    spark.udf.register("order_total", order_total, return_type)
    # --8<-- [end:register]
    assert return_type == "DOUBLE", return_type

    # --8<-- [start:sql]
    spark.sql("SELECT order_total(3, 19.99D, 10.0D) AS total").show()
    # --8<-- [end:sql]
    assert _one(spark, "SELECT order_total(3, 19.99D, 10.0D)") == 53.97

    # --8<-- [start:dataframe]
    from pyspark.sql.functions import call_function, expr

    orders = spark.createDataFrame(
        [(3, 19.99, 10.0), (1, 5.0, 0.0)],
        "quantity INT, unit_price DOUBLE, discount_pct DOUBLE",
    )
    orders.select(
        expr("order_total(quantity, unit_price, discount_pct)").alias("total")
    ).show()
    orders.select(
        call_function("order_total", "quantity", "unit_price", "discount_pct")
    ).show()
    # --8<-- [end:dataframe]
    by_expr = orders.select(expr("order_total(quantity, unit_price, discount_pct)"))
    assert [r[0] for r in by_expr.collect()] == [53.97, 5.0]
    by_call = orders.select(
        call_function("order_total", "quantity", "unit_price", "discount_pct")
    )
    assert [r[0] for r in by_call.collect()] == [53.97, 5.0]

    _udf_edges(spark, client)
    _sql_body_functions(spark, client)
    _runs_on_workers(spark, client)
    _default_registration_fails(spark, client)

    # A replace from another client doesn't reach the session copy.
    _with_api("replace_order_total")
    assert _one(spark, "SELECT order_total(3, 19.99D, 10.0D)") == 53.97
    assert "+ 1" in client.get_function(NAME).routine_definition

    # --8<-- [start:refresh]
    order_total = client.get_function_as_callable(name, register_function=False)
    return_type = client.get_function(name).full_data_type
    spark.udf.register("order_total", order_total, return_type)
    # --8<-- [end:refresh]
    assert return_type == "DOUBLE", return_type
    assert _one(spark, "SELECT order_total(3, 19.99D, 10.0D)") == 54.97

    # A replace that changes the return type: the session copy keeps the old
    # body and type until the refresh region runs again, which picks up both.
    _with_api("replace_order_total_as_text")
    assert client.get_function(NAME).full_data_type == "STRING"
    assert _one(spark, "SELECT order_total(3, 19.99D, 10.0D)") == 54.97
    order_total = client.get_function_as_callable(name, register_function=False)
    return_type = client.get_function(name).full_data_type
    spark.udf.register("order_total", order_total, return_type)
    assert return_type == "STRING", return_type
    assert _one(spark, "SELECT order_total(3, 19.99D, 10.0D)") == "53.97"

    # The session copy runs without contacting the catalog: it keeps working
    # after the function is deleted.
    _with_api("delete_order_total")
    assert client.get_function(NAME) is None
    assert _one(spark, "SELECT order_total(3, 19.99D, 10.0D)") == "53.97"

    spark.stop()
    _workers_need_no_client()
    asyncio.run(client.close_async())
    _with_api("drop_all")


def _native_resolution_fails(spark, catalog: str) -> None:
    """Spark resolves no catalog function: every function statement on a
    catalog name fails, on the Unity Catalog catalog that would serve it."""
    from pyspark.errors import AnalysisException
    from pyspark.sql.functions import call_function, lit

    functions = (
        f"[MISSING_CATALOG_ABILITY.FUNCTIONS] Catalog {catalog} does not support "
        "functions. SQLSTATE: 0A000"
    )
    create = (
        f"[MISSING_CATALOG_ABILITY.CREATE_FUNCTION] Catalog {catalog} does not "
        "support CREATE FUNCTION. SQLSTATE: 0A000"
    )
    sql = {
        "SELECT tools.pricing.order_total(3, 19.99D, 10.0D)": functions,
        "SELECT tools.pricing.double_it(3)": functions,
        "SHOW FUNCTIONS IN tools.pricing": functions,
        "SHOW USER FUNCTIONS IN tools.pricing": functions,
        "DESCRIBE FUNCTION tools.pricing.order_total": functions,
        "DROP FUNCTION tools.pricing.order_total": functions,
        "CREATE FUNCTION tools.pricing.y(x INT) RETURNS INT RETURN x * 2": create,
        "CREATE FUNCTION tools.pricing.f AS 'com.example.F'": create,
    }
    for statement, expected in sql.items():
        _raises(AnalysisException, expected, lambda s=statement: spark.sql(s).collect())
    # listFunctions resolves the database name in the current catalog.
    _raises(
        AnalysisException,
        functions.replace(f"Catalog {catalog}", "Catalog unity"),
        lambda: spark.catalog.listFunctions("tools.pricing"),
    )
    _raises(
        AnalysisException,
        functions,
        lambda: spark.catalog.functionExists("tools.pricing.order_total"),
    )
    _raises(
        AnalysisException,
        functions,
        lambda: spark.catalog.getFunction("tools.pricing.order_total"),
    )
    df = spark.range(1)
    _raises(
        AnalysisException,
        functions,
        lambda: df.select(
            call_function("tools.pricing.order_total", lit(3), lit(19.99), lit(10.0))
        ).collect(),
    )


def _udf_edges(spark, client) -> None:
    from pyspark.errors import PythonException

    # SQL decimal literals reach Python as decimal.Decimal; the result isn't a
    # float, and Spark returns NULL for a result that doesn't match DOUBLE.
    spark.udf.register("arg_type", lambda x: type(x).__name__, "STRING")
    assert _one(spark, "SELECT arg_type(19.99)") == "Decimal"
    assert _one(spark, "SELECT arg_type(19.99D)") == "float"
    assert _one(spark, "SELECT arg_type(3)") == "int"
    assert _one(spark, "SELECT order_total(3, 19.99, 10.0)") is None
    assert _one(spark, "SELECT order_total(3, 19.99D, 10.0D)") == 53.97
    # The rebuilt function has no defaults (R01), so leaving out discount_pct
    # fails in the worker.
    _raises(
        PythonException,
        "TypeError: order_total() missing 1 required positional argument: "
        "'discount_pct'",
        lambda: spark.sql("SELECT order_total(3, 19.99D)").collect(),
    )
    # A return type other than the function's: BIGINT gives NULL, not an
    # error; STRING converts the float to its text.
    fn = client.get_function_as_callable(NAME, register_function=False)
    spark.udf.register("order_total_bigint", fn, "BIGINT")
    assert _one(spark, "SELECT order_total_bigint(3, 19.99D, 10.0D)") is None
    spark.udf.register("order_total_string", fn, "STRING")
    assert _one(spark, "SELECT order_total_string(3, 19.99D, 10.0D)") == "53.97"


def _sql_body_functions(spark, client) -> None:
    """A SQL-body function can't be rebuilt or run by unitycatalog-ai."""
    info = client.get_function(NAME)
    assert (info.routine_body, info.external_language) == ("EXTERNAL", "PYTHON")
    assert client.get_function("tools.pricing.double_it").routine_body == "SQL"
    _raises(
        ValueError,
        "Function tools.pricing.double_it is not an EXTERNAL Python function and "
        "cannot be retrieved.",
        lambda: client.get_function_as_callable(
            "tools.pricing.double_it", register_function=False
        ),
    )
    _raises(
        NotImplementedError,
        "routine_body SQL is not supported. Only 'EXTERNAL' Python body "
        "extraction is supported.",
        lambda: client.execute_function("tools.pricing.double_it", parameters={"x": 3}),
    )


def _runs_on_workers(spark, client) -> None:
    """The UDF runs in Spark's Python worker processes, not in the driver."""
    name = "tools.pricing.process_id"
    fn = client.get_function_as_callable(name, register_function=False)
    spark.udf.register("process_id", fn, client.get_function(name).full_data_type)
    worker = _one(spark, "SELECT process_id('x')")
    assert isinstance(worker, int) and worker != os.getpid(), worker


def _default_registration_fails(spark, client) -> None:
    """With the default register_function=True, the rebuilt function belongs
    to unitycatalog-ai's execution_utils module, so Spark pickles it by
    reference and the worker can't find it."""
    from pyspark.errors import PythonException
    from unitycatalog.ai.core.utils import execution_utils

    fn = client.get_function_as_callable(NAME)
    # Stored in, and named after, execution_utils' globals.
    assert fn.__module__ == "unitycatalog.ai.core.utils.execution_utils"
    assert execution_utils.order_total is fn
    spark.udf.register("order_total_default", fn, "DOUBLE")
    _raises(
        PythonException,
        "AttributeError: Can't get attribute 'order_total' on <module "
        "'unitycatalog.ai.core.utils.execution_utils'",
        lambda: spark.sql("SELECT order_total_default(3, 19.99D, 10.0D)").collect(),
    )


def _workers_need_no_client() -> None:
    """Workers run the UDF with a Python that has no unitycatalog package:
    only the driver needs unitycatalog-ai."""
    from pyspark.sql import SparkSession
    from unitycatalog.ai.core.client import UnitycatalogFunctionClient
    from unitycatalog.client import ApiClient, Configuration

    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(
            [sys._base_executable, "-m", "venv", "--without-pip", tmp], check=True
        )
        bare = str(Path(tmp) / "bin" / "python")
        probe = "import importlib.util as u; print(u.find_spec('unitycatalog'))"
        out = subprocess.run([bare, "-c", probe], capture_output=True, text=True)
        assert out.stdout.strip() == "None", out
        os.environ["PYSPARK_PYTHON"] = bare
        try:
            _with_api("register_all")
            spark = SparkSession.builder.appName("bare-workers").getOrCreate()
            spark.sparkContext.setLogLevel("FATAL")

            async def connect():
                return UnitycatalogFunctionClient(
                    api_client=ApiClient(Configuration(host=URL))
                )

            client = asyncio.run(connect())
            for short in ("order_total", "has_unitycatalog"):
                name = f"tools.pricing.{short}"
                fn = client.get_function_as_callable(name, register_function=False)
                spark.udf.register(short, fn, client.get_function(name).full_data_type)
            assert _one(spark, "SELECT has_unitycatalog('x')") is False
            assert _one(spark, "SELECT order_total(3, 19.99D, 10.0D)") == 53.97
            # With the default register_function=True, the worker has to import
            # execution_utils to find the function, and can't.
            from pyspark.errors import PythonException

            fn = client.get_function_as_callable(NAME)
            spark.udf.register("order_total_default", fn, "DOUBLE")
            _raises(
                PythonException,
                "ModuleNotFoundError: No module named 'unitycatalog'",
                lambda: spark.sql(
                    "SELECT order_total_default(3, 19.99D, 10.0D)"
                ).collect(),
            )
            asyncio.run(client.close_async())
            spark.stop()
        finally:
            del os.environ["PYSPARK_PYTHON"]


def _configure_catalog(spark, name: str) -> None:
    prefix = f"spark.sql.catalog.{name}"
    spark.conf.set(prefix, "io.unitycatalog.spark.UCSingleCatalog")
    spark.conf.set(f"{prefix}.uri", "http://localhost:8080")
    spark.conf.set(f"{prefix}.auth.type", "static")
    spark.conf.set(f"{prefix}.auth.token", "not-used")


def _one(spark, query: str):
    return spark.sql(query).collect()[0][0]


def _raises(kind, text: str, call) -> None:
    try:
        call()
    except kind as exc:
        assert text in str(exc), f"{text!r} not in {str(exc)[:2000]!r}"
    else:
        raise AssertionError(f"expected {kind.__name__}: {text}")


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
    main()

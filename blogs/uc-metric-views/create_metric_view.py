# /// script
# requires-python = ">=3.12"
# dependencies = ["unitycatalog-client>=0.5", "pyyaml>=6"]
# ///
# --8<-- [start:create-metric-view]
import asyncio
import os
from pathlib import Path

from unitycatalog.client import (
    ApiClient,
    Configuration,
    CreateTable,
    TablesApi,
)
from unitycatalog.client.models import (
    Dependency,
    DependencyList,
    TableDependency,
    TableType,
)

DEFAULT_URL = "http://localhost:8080/api/2.1/unity-catalog"
config = Configuration(host=os.environ.get("UC_BASE_URL", DEFAULT_URL))


async def main():
    view_definition = Path("./blogs/uc-metric-views/metric-view.yaml").read_text()
    view_dependencies = DependencyList(
        dependencies=[
            Dependency(table=TableDependency(table_full_name="samples.tpch.orders")),
            Dependency(table=TableDependency(table_full_name="samples.tpch.customer")),
        ]
    )

    async with ApiClient(config) as api:
        tables = TablesApi(api)
        table = await tables.create_table(
            CreateTable(
                name="orders_metric_view",
                catalog_name="samples",
                schema_name="tpch",
                table_type=TableType.METRIC_VIEW,
                view_definition=view_definition,
                view_dependencies=view_dependencies,
                columns=[],
            )
        )
        print(f"created metric view: {table.name}")


# --8<-- [end:create-metric-view]

if __name__ == "__main__":
    summary = asyncio.run(main())

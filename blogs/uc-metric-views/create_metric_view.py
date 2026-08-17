# /// script
# requires-python = ">=3.12"
# dependencies = ["unitycatalog-client>=0.5", pyyaml=*]
# ///
# --8<-- [start:create-view]
import os
from pathlib import Path

from unitycatalog.client import (
    ApiClient,
    Configuration,
    CreateTable,
    TablesApi,
)
from unitycatalog.client.models import (
    ColumnInfo,
    ColumnTypeName,
    Dependency,
    DependencyList,
    TableDependency,
    TableType,
)

DEFAULT_URL = "http://localhost:8080/api/2.1/unity-catalog"
config = Configuration(host=os.environ.get("UC_BASE_URL", DEFAULT_URL))

view_definition = Path("./metric-view.yaml").read_text()

async with ApiClient(config) as api:
    tables = TablesApi(api)
    table = await tables.create_table(
        CreateTable(
            name="orders_metric_view",
            catalog_name="samples",
            schema_name="tcph",
            table_type=TableType.MATERIALIZED_VIEW,
            view_definition=view_definition,
            view_dependencies=DependencyList(
                dependencies=[
                    Dependency(
                        table=TableDependency(table_full_name="samples.tpch.orders")
                    ),
                    Dependency(
                        table=TableDependency(table_full_name="samples.tpch.customers")
                    ),
                ]
            ),
            columns=[
                ColumnInfo(
                    name="id",
                    type_name=ColumnTypeName.LONG,
                    type_text="bigint",
                    type_json='{"name":"id","type":"long","nullable":false,"metadata":{}}',
                    position=0,
                    nullable=False,
                )
            ],
        )
    )
# --8<-- [end:create-view]

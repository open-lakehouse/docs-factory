# Environment `uc-local` — no gateway

## Direct endpoints

| Module | Service | Endpoint | Host URL |
| --- | --- | --- | --- |
| `rustfs` | `rustfs` | `s3` | http://localhost:9000/ |
| `unity-catalog` | `unitycatalog` | `rest` | http://localhost:8080/api/2.1/unity-catalog |
| `unity-catalog` | `unitycatalog` | `rest_alias` | http://localhost:8080/unity-catalog |

## Services

| Module | Service | Role | Placement | Endpoints |
| --- | --- | --- | --- | --- |
| `envoy` | `envoy` | `gateway` | container `envoy` | http:10000 |
| `postgres` | `db` | `relational_db` | container `db` | sql:5432 |
| `rustfs` | `rustfs` | `object_store` | container `rustfs` | s3:9000 |
| `unity-catalog` | `unitycatalog` | `data_catalog` | container `unitycatalog` | rest:8080, rest_alias:8080 |

# Environment `uc-docs` — no gateway

## Direct endpoints

| Module | Service | Endpoint | Host URL |
| --- | --- | --- | --- |
| `unity-catalog` | `unitycatalog` | `rest` | http://localhost:8080/api/2.1/unity-catalog |
| `unity-catalog` | `unitycatalog` | `rest_alias` | http://localhost:8080/unity-catalog |

## Services

| Module | Service | Role | Placement | Endpoints |
| --- | --- | --- | --- | --- |
| `unity-catalog` | `unitycatalog` | `data_catalog` | container `unitycatalog` | rest:8080, rest_alias:8080 |

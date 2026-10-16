# Environment `uc-docs` — gateway http://localhost:8080

## Gateway routes

| Listener | Prefix | Service (cluster) | Upstream | Rewrite |
| --- | --- | --- | --- | --- |
| shared :8080 | `/api/2.1/unity-catalog` | `unitycatalog` | unitycatalog:8080 | — |
| shared :8080 | `/unity-catalog` | `unitycatalog` | unitycatalog:8080 | — |

## Services

| Module | Service | Role | Placement | Endpoints |
| --- | --- | --- | --- | --- |
| `envoy` | `envoy` | `gateway` | container `envoy` | http:10000 |
| `unity-catalog` | `unitycatalog` | `data_catalog` | container `unitycatalog` | rest:8080, rest_alias:8080 |

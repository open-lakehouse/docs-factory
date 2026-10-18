# Environment `uc-hybrid` — no gateway

## Direct endpoints

| Module | Service | Endpoint | Host URL |
| --- | --- | --- | --- |
| `unity-catalog` | `unitycatalog` | `rest` | http://localhost:8080/api/2.1/unity-catalog |
| `unity-catalog` | `unitycatalog` | `rest_alias` | http://localhost:8080/unity-catalog |

## Services

| Module | Service | Role | Placement | Endpoints |
| --- | --- | --- | --- | --- |
| `aws-s3` | `s3` | `object_store` | external `https://your-account.r2.cloudflarestorage.com` | s3:443 |
| `hosted-postgres` | `db` | `relational_db` | external `tcp://ep-your-project.us-east-2.aws.neon.tech:5432` | sql:5432 |
| `unity-catalog` | `unitycatalog` | `data_catalog` | container `unitycatalog` | rest:8080, rest_alias:8080 |

## Hosted resources

Provided outside the stack: README.md walks through creating the listed resources
and setting the secrets before the stack starts.

| Module | Vendor | Cloud | Reached at | Must exist | Secrets |
| --- | --- | --- | --- | --- | --- |
| `aws-s3` | Other | — | `https://your-account.r2.cloudflarestorage.com` | `unity` | `AWS_ACCESS_KEY_ID`, `AWS_ENDPOINT_URL`, `AWS_SECRET_ACCESS_KEY` |
| `hosted-postgres` | Neon | neon | `tcp://ep-your-project.us-east-2.aws.neon.tech:5432` | `unitycatalog` | `PGHOST`, `PGPASSWORD`, `PGUSER` |

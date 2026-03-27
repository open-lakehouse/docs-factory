# Local Development with Garage (S3-compatible storage)

This guide explains how to run the examples locally against a real S3-compatible
endpoint using [Garage](https://garagehq.deuxfleurs.fr/) — a lightweight,
self-hosted object-storage server.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) with Compose v2 (`docker compose`)
- `curl` on your PATH (used by the health-check and init script)

## 1. Start the Garage container

From the repository root:

```bash
docker compose up -d garage
```

Garage exposes two ports:

| Port | Purpose |
|------|---------|
| `3900` | S3-compatible API |
| `3902` | Admin API |

The container is configured via `infra/garage.toml` and stores all data in
`/tmp/garage` inside the container (ephemeral — wiped when the container is
removed).

## 2. Initialise the cluster and create credentials

Run the bundled init script **once** after the container first starts (or after
recreating it):

```bash
bash scripts/garage-init.sh
```

The script:
1. Waits up to 30 seconds for Garage to be ready.
2. Configures a single-node cluster layout.
3. Creates an access key named `test-key`.
4. Creates a bucket named `test-delta`.
5. Grants the key read/write access to the bucket.
6. Prints the credentials.

Example output:

```
Garage is healthy (3s elapsed)
Node ID: abc123...
...
==============================
Garage initialised successfully
==============================
Access Key ID:     GK...
Secret Access Key: ...

Export these environment variables before running examples:

  export AWS_ACCESS_KEY_ID=GK...
  export AWS_SECRET_ACCESS_KEY=...
  export AWS_ENDPOINT_URL=http://localhost:3900
  export AWS_REGION=us-east-1
```

## 3. Export environment variables

Copy and run the `export` lines printed by the script:

```bash
export AWS_ACCESS_KEY_ID=<value from script>
export AWS_SECRET_ACCESS_KEY=<value from script>
export AWS_ENDPOINT_URL=http://localhost:3900
export AWS_REGION=us-east-1
```

## 4. Run examples

With the environment variables set you can run any example that writes to S3:

```bash
uv run python examples/<example_file>.py
```

## Stopping Garage

```bash
docker compose down
```

Add `-v` to also remove named volumes (none are used here, but good practice):

```bash
docker compose down -v
```

## Troubleshooting

**Container never becomes healthy**
Check container logs: `docker compose logs garage`

**`garage` command not found inside container**
The init script calls `docker compose exec garage garage …`. Make sure the
container is running (`docker compose ps`) before executing the script.

**Credentials lost after container restart**
Garage stores keys in `/tmp/garage/meta` which is ephemeral. Re-run
`scripts/garage-init.sh` after recreating the container.

---
title: Set and rotate the credential encryption key
summary: Encrypt the secret keys of S3-compatible storage credentials with a key you hold, keep it with your database backups, and move the stored secrets to a new key.
diataxis: how-to
project: unitycatalog
references:
  - unityCatalogServer
  - lakehouse.metadataStore
status: draft
---

A [Unity Catalog](model:unityCatalogServer) server stores the secret access
key of each `s3_compatible_access_key` storage credential in its metadata
database, encrypted with AES-256-GCM. You provide the key, so the database
alone doesn't reveal the secrets. The steps below run the server with JBang,
as in [Run the Unity Catalog server with Java](../run-server-with-java/index.md);
a container or the Helm chart takes the same variables.

:::prerequisites
- A JDK, version 17 or later, and [JBang](https://www.jbang.dev/download/).
- `curl` and `openssl`.
- A server folder, `uc-server`, whose metadata survives a restart: an H2 file
  or [PostgreSQL](../configure-backend-db/index.md).
- The access key pair of your S3-compatible storage, in `S3_ACCESS_KEY_ID` and
  `S3_SECRET_ACCESS_KEY`.
:::

## Create a key

The key is 32 random bytes in base64. Create one in the folder above
`uc-server`, readable by you only:

```bash file=./snippets/encryption_key.sh start=start:generate end=end:generate
```

Keep the key where you keep the database's backups and credentials, such as a
secrets manager. A backup of the database restores credentials only together
with the key that encrypted them.

## Start the server with the key

S3-compatible storage credentials are experimental and off by default. Turn
them on and pass the key in `UC_SERVER_CREDENTIAL_ENCRYPTION_KEY`:

```bash file=./snippets/encryption_key.sh start=start:start end=end:start
```

Give every server instance that shares the database the same key. A key that
isn't 32 bytes in base64 stops the server at startup. Without a key the server
starts, but can't create or use these credentials.

In the Helm chart, put the key in a Kubernetes Secret and name it in
`server.credentialEncryptionKeySecret.name`; the chart reads the `encryptionKey`
entry unless you set `server.credentialEncryptionKeySecret.key`. Set
`server.s3-compatible-storage.enabled=true` under
`server.config.extraProperties`.

## Store a credential

Create a storage credential with the key pair:

```bash file=./snippets/encryption_key.sh start=start:create end=end:create
```

The response carries the `access_key_id` but not the secret. The database row
holds the secret as `v1:<key id>:<ciphertext>`, where the key id is derived
from the key, so the server can tell which key a stored value needs.

## Rotate the key

The server decrypts with one key at a time. To move the stored secrets to a
new key, start the server with the new key, then supply each secret again; the
server encrypts it with the key it runs with. Until you do, the credentials
whose secrets you haven't supplied again can't vend credentials or reach
storage.

1. Stop every server instance, and create the new key, keeping the old one:

   ```bash file=./snippets/encryption_key.sh start=start:rotate end=end:rotate
   ```

2. Start the servers with the new key, with the same command as before.

3. List the credentials whose secrets the server can't read. At each start the
   server logs one warning per credential, naming the key id the secret was
   encrypted with and the server's key id:

   ```bash file=./snippets/encryption_key.sh start=start:unreadable end=end:unreadable
   ```

4. Supply the key pair of each listed credential again:

   ```bash file=./snippets/encryption_key.sh start=start:resupply end=end:resupply
   ```

   An update replaces the whole `s3_compatible_access_key` object, so include
   `assume_role` again if the credential has it.

5. Restart a server and check that the new start logs no warning. Then delete
   `credential-key.old`, or keep it with the backups taken before the rotation,
   which still need it.

If you don't have a credential's secret key, create a new key pair in the
storage and supply that instead. Then disable the old pair in the storage.

## Next steps

- Restrict who can manage storage credentials:
  [Core concepts](../../explanation/uc-basics/index.md).
- Keep the metadata in a shared database:
  [Configure PostgreSQL as the metadata database](../configure-backend-db/index.md).

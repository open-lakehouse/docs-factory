# Spec: read a table's files with a vended credential

Facts from content/unitycatalog/explanation/002-credential-vending (status: ready).

## Reader-facing

- Look up the table by name with your bearer token; the response includes the
  table's ID and storage location.
- Call `POST /temporary-table-credentials` with the table ID and an operation,
  `READ` or `READ_WRITE`.
- A read needs `USE CATALOG`, `USE SCHEMA`, and `SELECT` on the table. A write
  also needs `MODIFY`. Ownership covers both. Without them, no credential is
  returned.
- The response carries the credential, the URL it covers, and
  `expiration_time` in epoch milliseconds. Credentials last at most one hour.
- Read the files directly from storage with the credential. Renew before
  `expiration_time` by calling the endpoint again.

## Internal implementation

- The server resolves the one external location containing the table's path
  and uses that location's storage credential.
- On S3 it calls AWS STS `AssumeRole` on the storage role with a session policy
  narrowed to the prefix and operation.
- On Azure it gets a user-delegation key and signs a SAS token.
- External locations can't overlap, so the resolution is always unique.

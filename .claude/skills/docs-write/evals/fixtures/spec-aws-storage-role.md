# Spec: register an S3 storage role with Unity Catalog

Facts from content/unitycatalog/how-to/009-configure-aws-storage (status: ready).

## Unity Catalog steps (verified by aws_storage.py)

1. Create a storage credential `lake_storage` with the storage role's ARN.
   The server generates an external ID and returns it with the credential.
2. Update the storage role's trust policy to trust the master role `uc-master`
   with that external ID.
3. Create an external location `lake` for `s3://uc-docs/lake` that names
   `lake_storage`.
4. Check the chain: request temporary path credentials for a path under the
   location. A successful response proves the server's identity, the trust
   policy, the external ID, and the storage role's access.

## AWS steps

- Create the IAM role `uc-storage-lake` with a permission policy on the bucket
  and prefix, and a temporary trust policy.
- (Gap: the exact IAM console navigation for editing a role's trust policy is
  not in this spec.)

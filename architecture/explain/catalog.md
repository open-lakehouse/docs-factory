# Catalog

> Stub explanation body. Long-form prose is intentionally deferred; this file
> exists to exercise the `explainDoc` wiring for a **capability** node.

The catalog is the metadata authority of the lakehouse: the registry every
query resolves a table name through before a single byte is read. It records
which tables and schemas exist, where their data lives, and who may touch it.

In the open lakehouse it also brokers access. At resolution time the catalog
issues a short-lived, scoped storage credential for exactly the data a query
needs — *credential vending* — so raw storage keys are never handed out to
engines or users.

The specifications that specify this capability, and the implementations that
realize them, are listed in the context panel alongside this page.

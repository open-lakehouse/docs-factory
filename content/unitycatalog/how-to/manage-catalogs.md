---
title: Work with catalogs
summary: List, create, get, update, and delete catalogs using the Unity Catalog clients.
diataxis: how-to
project: unitycatalog
engines: [python, typescript, rust]
references:
  - ucSpec
  - unityCatalogOSS
status: draft
---

A catalog is the top-level namespace in Unity Catalog. This guide shows how to
perform common catalog operations using the Rust, Python, and TypeScript
clients.

## List catalogs

Retrieve all catalogs available to the authenticated user.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/catalogs.py start=start:list_catalogs end=end:list_catalogs
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/catalogs.ts start=start:list_catalogs end=end:list_catalogs
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/catalogs.rs start=start:list_catalogs end=end:list_catalogs
```

:::

::::

## Create a catalog

Create a new catalog with an optional description.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/catalogs.py start=start:create_catalog end=end:create_catalog
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/catalogs.ts start=start:create_catalog end=end:create_catalog
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/catalogs.rs start=start:create_catalog end=end:create_catalog
```

:::

::::

## Get a catalog

Retrieve details for a specific catalog by name.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/catalogs.py start=start:get_catalog end=end:get_catalog
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/catalogs.ts start=start:get_catalog end=end:get_catalog
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/catalogs.rs start=start:get_catalog end=end:get_catalog
```

:::

::::

## Update a catalog

Update a catalog's metadata, such as its description or owner.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/catalogs.py start=start:update_catalog end=end:update_catalog
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/catalogs.ts start=start:update_catalog end=end:update_catalog
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/catalogs.rs start=start:update_catalog end=end:update_catalog
```

:::

::::

## Delete a catalog

Delete a catalog. Use the `force` option to delete non-empty catalogs.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/catalogs.py start=start:delete_catalog end=end:delete_catalog
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/catalogs.ts start=start:delete_catalog end=end:delete_catalog
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/catalogs.rs start=start:delete_catalog end=end:delete_catalog
```

:::

::::

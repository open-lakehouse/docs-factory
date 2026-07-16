---
title: Work with catalogs
summary: List, create, get, update, and delete catalogs using the Unity Catalog clients.
diataxis: how-to
project: unitycatalog
engines: [python, typescript, rust]
snippets:
  - file: ../../../examples/python/catalogs.py
    start: docs-list_catalogs-start
    end: docs-list_catalogs-end
    engine: python
  - file: ../../../examples/typescript/examples/catalogs.ts
    start: docs-list_catalogs-start
    end: docs-list_catalogs-end
    engine: typescript
  - file: ../../../examples/rust/src/catalogs.rs
    start: docs-list_catalogs-start
    end: docs-list_catalogs-end
    engine: rust
  - file: ../../../examples/python/catalogs.py
    start: docs-create_catalog-start
    end: docs-create_catalog-end
    engine: python
  - file: ../../../examples/typescript/examples/catalogs.ts
    start: docs-create_catalog-start
    end: docs-create_catalog-end
    engine: typescript
  - file: ../../../examples/rust/src/catalogs.rs
    start: docs-create_catalog-start
    end: docs-create_catalog-end
    engine: rust
  - file: ../../../examples/python/catalogs.py
    start: docs-get_catalog-start
    end: docs-get_catalog-end
    engine: python
  - file: ../../../examples/typescript/examples/catalogs.ts
    start: docs-get_catalog-start
    end: docs-get_catalog-end
    engine: typescript
  - file: ../../../examples/rust/src/catalogs.rs
    start: docs-get_catalog-start
    end: docs-get_catalog-end
    engine: rust
  - file: ../../../examples/python/catalogs.py
    start: docs-update_catalog-start
    end: docs-update_catalog-end
    engine: python
  - file: ../../../examples/typescript/examples/catalogs.ts
    start: docs-update_catalog-start
    end: docs-update_catalog-end
    engine: typescript
  - file: ../../../examples/rust/src/catalogs.rs
    start: docs-update_catalog-start
    end: docs-update_catalog-end
    engine: rust
  - file: ../../../examples/python/catalogs.py
    start: docs-delete_catalog-start
    end: docs-delete_catalog-end
    engine: python
  - file: ../../../examples/typescript/examples/catalogs.ts
    start: docs-delete_catalog-start
    end: docs-delete_catalog-end
    engine: typescript
  - file: ../../../examples/rust/src/catalogs.rs
    start: docs-delete_catalog-start
    end: docs-delete_catalog-end
    engine: rust
status: draft
---

A catalog is the top-level namespace in Unity Catalog. This guide shows how to
perform common catalog operations using the Rust, Python, and TypeScript
clients.

## List catalogs

Retrieve all catalogs available to the authenticated user.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/catalogs.py start=docs-list_catalogs-start end=docs-list_catalogs-end
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/catalogs.ts start=docs-list_catalogs-start end=docs-list_catalogs-end
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/catalogs.rs start=docs-list_catalogs-start end=docs-list_catalogs-end
```

:::

::::

## Create a catalog

Create a new catalog with an optional description.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/catalogs.py start=docs-create_catalog-start end=docs-create_catalog-end
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/catalogs.ts start=docs-create_catalog-start end=docs-create_catalog-end
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/catalogs.rs start=docs-create_catalog-start end=docs-create_catalog-end
```

:::

::::

## Get a catalog

Retrieve details for a specific catalog by name.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/catalogs.py start=docs-get_catalog-start end=docs-get_catalog-end
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/catalogs.ts start=docs-get_catalog-start end=docs-get_catalog-end
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/catalogs.rs start=docs-get_catalog-start end=docs-get_catalog-end
```

:::

::::

## Update a catalog

Update a catalog's metadata, such as its description or owner.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/catalogs.py start=docs-update_catalog-start end=docs-update_catalog-end
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/catalogs.ts start=docs-update_catalog-start end=docs-update_catalog-end
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/catalogs.rs start=docs-update_catalog-start end=docs-update_catalog-end
```

:::

::::

## Delete a catalog

Delete a catalog. Use the `force` option to delete non-empty catalogs.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/catalogs.py start=docs-delete_catalog-start end=docs-delete_catalog-end
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/catalogs.ts start=docs-delete_catalog-start end=docs-delete_catalog-end
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/catalogs.rs start=docs-delete_catalog-start end=docs-delete_catalog-end
```

:::

::::

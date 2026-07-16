---
title: Work with tables
summary: List, create, get, and delete tables using the Unity Catalog clients.
diataxis: how-to
project: unitycatalog
engines: [python, typescript, rust]
snippets:
  - file: ../../../examples/python/tables.py
    start: docs-list_tables-start
    end: docs-list_tables-end
    engine: python
  - file: ../../../examples/typescript/examples/tables.ts
    start: docs-list_tables-start
    end: docs-list_tables-end
    engine: typescript
  - file: ../../../examples/rust/src/tables.rs
    start: docs-list_tables-start
    end: docs-list_tables-end
    engine: rust
  - file: ../../../examples/python/tables.py
    start: docs-create_table-start
    end: docs-create_table-end
    engine: python
  - file: ../../../examples/typescript/examples/tables.ts
    start: docs-create_table-start
    end: docs-create_table-end
    engine: typescript
  - file: ../../../examples/rust/src/tables.rs
    start: docs-create_table-start
    end: docs-create_table-end
    engine: rust
  - file: ../../../examples/python/tables.py
    start: docs-get_table-start
    end: docs-get_table-end
    engine: python
  - file: ../../../examples/typescript/examples/tables.ts
    start: docs-get_table-start
    end: docs-get_table-end
    engine: typescript
  - file: ../../../examples/rust/src/tables.rs
    start: docs-get_table-start
    end: docs-get_table-end
    engine: rust
  - file: ../../../examples/python/tables.py
    start: docs-delete_table-start
    end: docs-delete_table-end
    engine: python
  - file: ../../../examples/typescript/examples/tables.ts
    start: docs-delete_table-start
    end: docs-delete_table-end
    engine: typescript
  - file: ../../../examples/rust/src/tables.rs
    start: docs-delete_table-start
    end: docs-delete_table-end
    engine: rust
status: draft
---

Tables are the primary storage objects in Unity Catalog. They can be managed or
external, and support multiple data source formats including Delta Lake.

## List tables

Retrieve all tables in a schema.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/tables.py start=docs-list_tables-start end=docs-list_tables-end
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/tables.ts start=docs-list_tables-start end=docs-list_tables-end
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/tables.rs start=docs-list_tables-start end=docs-list_tables-end
```

:::

::::

## Create a table

Create a new managed Delta table.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/tables.py start=docs-create_table-start end=docs-create_table-end
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/tables.ts start=docs-create_table-start end=docs-create_table-end
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/tables.rs start=docs-create_table-start end=docs-create_table-end
```

:::

::::

## Get a table

Retrieve details for a specific table by its full three-part name
(`catalog.schema.table`).

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/tables.py start=docs-get_table-start end=docs-get_table-end
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/tables.ts start=docs-get_table-start end=docs-get_table-end
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/tables.rs start=docs-get_table-start end=docs-get_table-end
```

:::

::::

## Delete a table

Delete a table by its full three-part name.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/tables.py start=docs-delete_table-start end=docs-delete_table-end
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/tables.ts start=docs-delete_table-start end=docs-delete_table-end
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/tables.rs start=docs-delete_table-start end=docs-delete_table-end
```

:::

::::

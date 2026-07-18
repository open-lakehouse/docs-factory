---
title: Work with tables
summary: List, create, get, and delete tables using the Unity Catalog clients.
diataxis: how-to
project: unitycatalog
engines: [python, typescript, rust]
status: draft
---

Tables are the primary storage objects in Unity Catalog. They can be managed or
external, and support multiple data source formats including Delta Lake.

## List tables

Retrieve all tables in a schema.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/tables.py start=start:list_tables end=end:list_tables
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/tables.ts start=start:list_tables end=end:list_tables
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/tables.rs start=start:list_tables end=end:list_tables
```

:::

::::

## Create a table

Create a new managed Delta table.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/tables.py start=start:create_table end=end:create_table
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/tables.ts start=start:create_table end=end:create_table
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/tables.rs start=start:create_table end=end:create_table
```

:::

::::

## Get a table

Retrieve details for a specific table by its full three-part name
(`catalog.schema.table`).

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/tables.py start=start:get_table end=end:get_table
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/tables.ts start=start:get_table end=end:get_table
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/tables.rs start=start:get_table end=end:get_table
```

:::

::::

## Delete a table

Delete a table by its full three-part name.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/tables.py start=start:delete_table end=end:delete_table
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/tables.ts start=start:delete_table end=end:delete_table
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/tables.rs start=start:delete_table end=end:delete_table
```

:::

::::

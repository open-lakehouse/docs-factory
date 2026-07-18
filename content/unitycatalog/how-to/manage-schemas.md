---
title: Work with schemas
summary: List, create, get, update, and delete schemas using the Unity Catalog clients.
diataxis: how-to
project: unitycatalog
engines: [python, typescript, rust]
references:
  - ucSpec
  - unityCatalogOSS
status: draft
---

A schema (also called a database) is a namespace within a catalog that contains tables and volumes.

## List schemas

Retrieve all schemas in a catalog.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/schemas.py start=start:list_schemas end=end:list_schemas
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/schemas.ts start=start:list_schemas end=end:list_schemas
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/schemas.rs start=start:list_schemas end=end:list_schemas
```

:::

::::

## Create a schema

Create a new schema inside an existing catalog.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/schemas.py start=start:create_schema end=end:create_schema
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/schemas.ts start=start:create_schema end=end:create_schema
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/schemas.rs start=start:create_schema end=end:create_schema
```

:::

::::

## Get a schema

Retrieve details for a specific schema.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/schemas.py start=start:get_schema end=end:get_schema
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/schemas.ts start=start:get_schema end=end:get_schema
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/schemas.rs start=start:get_schema end=end:get_schema
```

:::

::::

## Update a schema

Update a schema's metadata, such as its description or name.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/schemas.py start=start:update_schema end=end:update_schema
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/schemas.ts start=start:update_schema end=end:update_schema
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/schemas.rs start=start:update_schema end=end:update_schema
```

:::

::::

## Delete a schema

Delete a schema. The schema must be empty unless the `force` option is used.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/schemas.py start=start:delete_schema end=end:delete_schema
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/schemas.ts start=start:delete_schema end=end:delete_schema
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/schemas.rs start=start:delete_schema end=end:delete_schema
```

:::

::::

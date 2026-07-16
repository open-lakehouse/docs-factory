---
title: Work with schemas
summary: List, create, get, update, and delete schemas using the Unity Catalog clients.
diataxis: how-to
project: unitycatalog
engines: [python, typescript, rust]
snippets:
  - file: ../../../examples/python/schemas.py
    start: docs-list_schemas-start
    end: docs-list_schemas-end
    engine: python
  - file: ../../../examples/typescript/examples/schemas.ts
    start: docs-list_schemas-start
    end: docs-list_schemas-end
    engine: typescript
  - file: ../../../examples/rust/src/schemas.rs
    start: docs-list_schemas-start
    end: docs-list_schemas-end
    engine: rust
  - file: ../../../examples/python/schemas.py
    start: docs-create_schema-start
    end: docs-create_schema-end
    engine: python
  - file: ../../../examples/typescript/examples/schemas.ts
    start: docs-create_schema-start
    end: docs-create_schema-end
    engine: typescript
  - file: ../../../examples/rust/src/schemas.rs
    start: docs-create_schema-start
    end: docs-create_schema-end
    engine: rust
  - file: ../../../examples/python/schemas.py
    start: docs-get_schema-start
    end: docs-get_schema-end
    engine: python
  - file: ../../../examples/typescript/examples/schemas.ts
    start: docs-get_schema-start
    end: docs-get_schema-end
    engine: typescript
  - file: ../../../examples/rust/src/schemas.rs
    start: docs-get_schema-start
    end: docs-get_schema-end
    engine: rust
  - file: ../../../examples/python/schemas.py
    start: docs-update_schema-start
    end: docs-update_schema-end
    engine: python
  - file: ../../../examples/typescript/examples/schemas.ts
    start: docs-update_schema-start
    end: docs-update_schema-end
    engine: typescript
  - file: ../../../examples/rust/src/schemas.rs
    start: docs-update_schema-start
    end: docs-update_schema-end
    engine: rust
  - file: ../../../examples/python/schemas.py
    start: docs-delete_schema-start
    end: docs-delete_schema-end
    engine: python
  - file: ../../../examples/typescript/examples/schemas.ts
    start: docs-delete_schema-start
    end: docs-delete_schema-end
    engine: typescript
  - file: ../../../examples/rust/src/schemas.rs
    start: docs-delete_schema-start
    end: docs-delete_schema-end
    engine: rust
status: draft
---

A schema (also called a database) is a namespace within a catalog that contains tables and volumes.

## List schemas

Retrieve all schemas in a catalog.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/schemas.py start=docs-list_schemas-start end=docs-list_schemas-end
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/schemas.ts start=docs-list_schemas-start end=docs-list_schemas-end
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/schemas.rs start=docs-list_schemas-start end=docs-list_schemas-end
```

:::

::::

## Create a schema

Create a new schema inside an existing catalog.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/schemas.py start=docs-create_schema-start end=docs-create_schema-end
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/schemas.ts start=docs-create_schema-start end=docs-create_schema-end
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/schemas.rs start=docs-create_schema-start end=docs-create_schema-end
```

:::

::::

## Get a schema

Retrieve details for a specific schema.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/schemas.py start=docs-get_schema-start end=docs-get_schema-end
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/schemas.ts start=docs-get_schema-start end=docs-get_schema-end
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/schemas.rs start=docs-get_schema-start end=docs-get_schema-end
```

:::

::::

## Update a schema

Update a schema's metadata, such as its description or name.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/schemas.py start=docs-update_schema-start end=docs-update_schema-end
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/schemas.ts start=docs-update_schema-start end=docs-update_schema-end
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/schemas.rs start=docs-update_schema-start end=docs-update_schema-end
```

:::

::::

## Delete a schema

Delete a schema. The schema must be empty unless the `force` option is used.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/schemas.py start=docs-delete_schema-start end=docs-delete_schema-end
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/schemas.ts start=docs-delete_schema-start end=docs-delete_schema-end
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/schemas.rs start=docs-delete_schema-start end=docs-delete_schema-end
```

:::

::::

---
title: Work with volumes
summary: List, create, get, update, and delete volumes using the Unity Catalog clients.
diataxis: how-to
project: unitycatalog
engines: [python, typescript, rust]
snippets:
  - file: ../../../examples/python/volumes.py
    start: docs-list_volumes-start
    end: docs-list_volumes-end
    engine: python
  - file: ../../../examples/typescript/examples/volumes.ts
    start: docs-list_volumes-start
    end: docs-list_volumes-end
    engine: typescript
  - file: ../../../examples/rust/src/volumes.rs
    start: docs-list_volumes-start
    end: docs-list_volumes-end
    engine: rust
  - file: ../../../examples/python/volumes.py
    start: docs-create_volume-start
    end: docs-create_volume-end
    engine: python
  - file: ../../../examples/typescript/examples/volumes.ts
    start: docs-create_volume-start
    end: docs-create_volume-end
    engine: typescript
  - file: ../../../examples/rust/src/volumes.rs
    start: docs-create_volume-start
    end: docs-create_volume-end
    engine: rust
  - file: ../../../examples/python/volumes.py
    start: docs-get_volume-start
    end: docs-get_volume-end
    engine: python
  - file: ../../../examples/typescript/examples/volumes.ts
    start: docs-get_volume-start
    end: docs-get_volume-end
    engine: typescript
  - file: ../../../examples/rust/src/volumes.rs
    start: docs-get_volume-start
    end: docs-get_volume-end
    engine: rust
  - file: ../../../examples/python/volumes.py
    start: docs-update_volume-start
    end: docs-update_volume-end
    engine: python
  - file: ../../../examples/typescript/examples/volumes.ts
    start: docs-update_volume-start
    end: docs-update_volume-end
    engine: typescript
  - file: ../../../examples/rust/src/volumes.rs
    start: docs-update_volume-start
    end: docs-update_volume-end
    engine: rust
  - file: ../../../examples/python/volumes.py
    start: docs-delete_volume-start
    end: docs-delete_volume-end
    engine: python
  - file: ../../../examples/typescript/examples/volumes.ts
    start: docs-delete_volume-start
    end: docs-delete_volume-end
    engine: typescript
  - file: ../../../examples/rust/src/volumes.rs
    start: docs-delete_volume-start
    end: docs-delete_volume-end
    engine: rust
status: draft
---

Volumes provide a governed interface for storing and accessing non-tabular data,
such as files and directories, in cloud object storage.

## List volumes

Retrieve all volumes in a schema.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/volumes.py start=docs-list_volumes-start end=docs-list_volumes-end
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/volumes.ts start=docs-list_volumes-start end=docs-list_volumes-end
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/volumes.rs start=docs-list_volumes-start end=docs-list_volumes-end
```

:::

::::

## Create a volume

Create a new managed volume.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/volumes.py start=docs-create_volume-start end=docs-create_volume-end
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/volumes.ts start=docs-create_volume-start end=docs-create_volume-end
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/volumes.rs start=docs-create_volume-start end=docs-create_volume-end
```

:::

::::

## Get a volume

Retrieve details for a specific volume.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/volumes.py start=docs-get_volume-start end=docs-get_volume-end
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/volumes.ts start=docs-get_volume-start end=docs-get_volume-end
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/volumes.rs start=docs-get_volume-start end=docs-get_volume-end
```

:::

::::

## Update a volume

Update a volume's metadata, such as its description.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/volumes.py start=docs-update_volume-start end=docs-update_volume-end
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/volumes.ts start=docs-update_volume-start end=docs-update_volume-end
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/volumes.rs start=docs-update_volume-start end=docs-update_volume-end
```

:::

::::

## Delete a volume

Delete a volume.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/volumes.py start=docs-delete_volume-start end=docs-delete_volume-end
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/volumes.ts start=docs-delete_volume-start end=docs-delete_volume-end
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/volumes.rs start=docs-delete_volume-start end=docs-delete_volume-end
```

:::

::::

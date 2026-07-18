---
title: Work with volumes
summary: List, create, get, update, and delete volumes using the Unity Catalog clients.
diataxis: how-to
project: unitycatalog
engines: [python, typescript, rust]
snippets:
  - file: ../../../examples/python/volumes.py
    start: start:list_volumes
    end: end:list_volumes
    engine: python
  - file: ../../../examples/typescript/examples/volumes.ts
    start: start:list_volumes
    end: end:list_volumes
    engine: typescript
  - file: ../../../examples/rust/src/volumes.rs
    start: start:list_volumes
    end: end:list_volumes
    engine: rust
  - file: ../../../examples/python/volumes.py
    start: start:create_volume
    end: end:create_volume
    engine: python
  - file: ../../../examples/typescript/examples/volumes.ts
    start: start:create_volume
    end: end:create_volume
    engine: typescript
  - file: ../../../examples/rust/src/volumes.rs
    start: start:create_volume
    end: end:create_volume
    engine: rust
  - file: ../../../examples/python/volumes.py
    start: start:get_volume
    end: end:get_volume
    engine: python
  - file: ../../../examples/typescript/examples/volumes.ts
    start: start:get_volume
    end: end:get_volume
    engine: typescript
  - file: ../../../examples/rust/src/volumes.rs
    start: start:get_volume
    end: end:get_volume
    engine: rust
  - file: ../../../examples/python/volumes.py
    start: start:update_volume
    end: end:update_volume
    engine: python
  - file: ../../../examples/typescript/examples/volumes.ts
    start: start:update_volume
    end: end:update_volume
    engine: typescript
  - file: ../../../examples/rust/src/volumes.rs
    start: start:update_volume
    end: end:update_volume
    engine: rust
  - file: ../../../examples/python/volumes.py
    start: start:delete_volume
    end: end:delete_volume
    engine: python
  - file: ../../../examples/typescript/examples/volumes.ts
    start: start:delete_volume
    end: end:delete_volume
    engine: typescript
  - file: ../../../examples/rust/src/volumes.rs
    start: start:delete_volume
    end: end:delete_volume
    engine: rust
status: draft
---

Volumes provide a governed interface for storing and accessing non-tabular data,
such as files and directories, in cloud object storage.

## List volumes

Retrieve all volumes in a schema.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/volumes.py start=start:list_volumes end=end:list_volumes
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/volumes.ts start=start:list_volumes end=end:list_volumes
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/volumes.rs start=start:list_volumes end=end:list_volumes
```

:::

::::

## Create a volume

Create a new managed volume.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/volumes.py start=start:create_volume end=end:create_volume
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/volumes.ts start=start:create_volume end=end:create_volume
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/volumes.rs start=start:create_volume end=end:create_volume
```

:::

::::

## Get a volume

Retrieve details for a specific volume.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/volumes.py start=start:get_volume end=end:get_volume
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/volumes.ts start=start:get_volume end=end:get_volume
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/volumes.rs start=start:get_volume end=end:get_volume
```

:::

::::

## Update a volume

Update a volume's metadata, such as its description.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/volumes.py start=start:update_volume end=end:update_volume
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/volumes.ts start=start:update_volume end=end:update_volume
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/volumes.rs start=start:update_volume end=end:update_volume
```

:::

::::

## Delete a volume

Delete a volume.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/volumes.py start=start:delete_volume end=end:delete_volume
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/volumes.ts start=start:delete_volume end=end:delete_volume
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/volumes.rs start=start:delete_volume end=end:delete_volume
```

:::

::::

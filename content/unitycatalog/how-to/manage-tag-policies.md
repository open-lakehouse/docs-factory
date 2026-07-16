---
title: Work with tag policies
summary: List, create, get, update, and delete governed tag definitions (tag policies) using the Unity Catalog clients.
diataxis: how-to
project: unitycatalog
engines: [python, typescript, rust]
snippets:
  - file: ../../../examples/python/tag_policies.py
    start: docs-list_tag_policies-start
    end: docs-list_tag_policies-end
    engine: python
  - file: ../../../examples/typescript/examples/tag_policies.ts
    start: docs-list_tag_policies-start
    end: docs-list_tag_policies-end
    engine: typescript
  - file: ../../../examples/rust/src/tag_policies.rs
    start: docs-list_tag_policies-start
    end: docs-list_tag_policies-end
    engine: rust
  - file: ../../../examples/python/tag_policies.py
    start: docs-create_tag_policy-start
    end: docs-create_tag_policy-end
    engine: python
  - file: ../../../examples/rust/src/tag_policies.rs
    start: docs-create_tag_policy-start
    end: docs-create_tag_policy-end
    engine: rust
  - file: ../../../examples/python/tag_policies.py
    start: docs-get_tag_policy-start
    end: docs-get_tag_policy-end
    engine: python
  - file: ../../../examples/typescript/examples/tag_policies.ts
    start: docs-get_tag_policy-start
    end: docs-get_tag_policy-end
    engine: typescript
  - file: ../../../examples/rust/src/tag_policies.rs
    start: docs-get_tag_policy-start
    end: docs-get_tag_policy-end
    engine: rust
  - file: ../../../examples/python/tag_policies.py
    start: docs-update_tag_policy-start
    end: docs-update_tag_policy-end
    engine: python
  - file: ../../../examples/rust/src/tag_policies.rs
    start: docs-update_tag_policy-start
    end: docs-update_tag_policy-end
    engine: rust
  - file: ../../../examples/python/tag_policies.py
    start: docs-delete_tag_policy-start
    end: docs-delete_tag_policy-end
    engine: python
  - file: ../../../examples/typescript/examples/tag_policies.ts
    start: docs-delete_tag_policy-start
    end: docs-delete_tag_policy-end
    engine: typescript
  - file: ../../../examples/rust/src/tag_policies.rs
    start: docs-delete_tag_policy-start
    end: docs-delete_tag_policy-end
    engine: rust
status: draft
---

A tag policy is a *governed tag definition*: a tag key together with the rules
that govern how it can be used, including an optional set of allowed values.
Applying a governed tag to a securable is done through the Entity Tag
Assignments API. This guide shows how to manage tag policies using the Rust,
Python, and TypeScript clients.

:::note
The TypeScript client currently supports listing, getting, and deleting tag
policies. Creating and updating a policy with its full body (key, description,
allowed values) is available in the Rust and Python clients; TypeScript support
is tracked as a follow-up.
:::

## List tag policies

Retrieve all tag policies.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/tag_policies.py start=docs-list_tag_policies-start end=docs-list_tag_policies-end
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/tag_policies.ts start=docs-list_tag_policies-start end=docs-list_tag_policies-end
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/tag_policies.rs start=docs-list_tag_policies-start end=docs-list_tag_policies-end
```

:::

::::

## Create a tag policy

Create a governed tag definition with an optional description and set of allowed
values.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/tag_policies.py start=docs-create_tag_policy-start end=docs-create_tag_policy-end
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/tag_policies.rs start=docs-create_tag_policy-start end=docs-create_tag_policy-end
```

:::

::::

## Get a tag policy

Retrieve a specific tag policy by its tag key.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/tag_policies.py start=docs-get_tag_policy-start end=docs-get_tag_policy-end
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/tag_policies.ts start=docs-get_tag_policy-start end=docs-get_tag_policy-end
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/tag_policies.rs start=docs-get_tag_policy-start end=docs-get_tag_policy-end
```

:::

::::

## Update a tag policy

Update a tag policy's description or allowed values.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/tag_policies.py start=docs-update_tag_policy-start end=docs-update_tag_policy-end
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/tag_policies.rs start=docs-update_tag_policy-start end=docs-update_tag_policy-end
```

:::

::::

## Delete a tag policy

Delete a governed tag definition by its tag key.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/tag_policies.py start=docs-delete_tag_policy-start end=docs-delete_tag_policy-end
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/tag_policies.ts start=docs-delete_tag_policy-start end=docs-delete_tag_policy-end
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/tag_policies.rs start=docs-delete_tag_policy-start end=docs-delete_tag_policy-end
```

:::

::::

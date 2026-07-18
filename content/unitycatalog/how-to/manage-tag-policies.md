---
title: Work with tag policies
summary: List, create, get, update, and delete governed tag definitions (tag policies) using the Unity Catalog clients.
diataxis: how-to
project: unitycatalog
engines: [python, typescript, rust]
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

```python file=../../../examples/python/tag_policies.py start=start:list_tag_policies end=end:list_tag_policies
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/tag_policies.ts start=start:list_tag_policies end=end:list_tag_policies
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/tag_policies.rs start=start:list_tag_policies end=end:list_tag_policies
```

:::

::::

## Create a tag policy

Create a governed tag definition with an optional description and set of allowed
values.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/tag_policies.py start=start:create_tag_policy end=end:create_tag_policy
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/tag_policies.rs start=start:create_tag_policy end=end:create_tag_policy
```

:::

::::

## Get a tag policy

Retrieve a specific tag policy by its tag key.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/tag_policies.py start=start:get_tag_policy end=end:get_tag_policy
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/tag_policies.ts start=start:get_tag_policy end=end:get_tag_policy
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/tag_policies.rs start=start:get_tag_policy end=end:get_tag_policy
```

:::

::::

## Update a tag policy

Update a tag policy's description or allowed values.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/tag_policies.py start=start:update_tag_policy end=end:update_tag_policy
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/tag_policies.rs start=start:update_tag_policy end=end:update_tag_policy
```

:::

::::

## Delete a tag policy

Delete a governed tag definition by its tag key.

::::tabs{syncKey=language}

:::tab[Python]

```python file=../../../examples/python/tag_policies.py start=start:delete_tag_policy end=end:delete_tag_policy
```

:::

:::tab[TypeScript]

```typescript file=../../../examples/typescript/examples/tag_policies.ts start=start:delete_tag_policy end=end:delete_tag_policy
```

:::

:::tab[Rust]

```rust file=../../../examples/rust/src/tag_policies.rs start=start:delete_tag_policy end=end:delete_tag_policy
```

:::

::::

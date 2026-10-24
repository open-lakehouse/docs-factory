---
title: Run catalog functions in applications and notebooks
summary: unitycatalog-ai runs a catalog function on the caller's machine, in a sandboxed child process by default. Call it sync or async, set limits, and read errors.
diataxis: how-to
project: unitycatalog
references:
  - lakehouse.function
  - unityCatalogAi
  - unityCatalogServer
status: draft
---

When you call a [registered function](model:lakehouse.function) with
[`unitycatalog-ai`](model:unityCatalogAi), the client fetches the function's
stored definition from [Unity Catalog](model:unityCatalogServer) and rebuilds
it as Python. Unity Catalog stores the definition, and your application runs
it.

:::prerequisites
- [uv](https://docs.astral.sh/uv/getting-started/installation/).
- The functions in `pricing.py`, registered in `tools.pricing`:
  [Manage Python functions](../manage-python-functions/index.md).
- With authorization enabled, the privileges to view and run each function:
  [View a function](../manage-python-functions/index.md#view-a-function-and-get-its-source-back).
:::

The page shows each function from `pricing.py` where an example first calls
it. Most examples call `order_total`:

```python file=./snippets/pricing.py start=start:order-total end=end:order-total title="pricing.py"
```

## Set up the client

Start Python with `unitycatalog-ai`:

```bash
EXECUTOR_MAX_MEMORY_LIMIT=4096 uv run --python 3.12 --with unitycatalog-ai==0.4.0 python -m asyncio
```

Use Python 3.12, the version this page's scripts run on. The command sets the
sandbox's memory cap to 4096 MB, the value the scripts use. See
[Set time and memory limits](#set-time-and-memory-limits).

Create the function client:

```python file=./snippets/run_async.py start=start:connect end=end:connect
```

The async examples on this page run in this session. The synchronous example
and the notebook run on their own.

## Call a function from synchronous code

In a script with no event loop, create the client inside `asyncio.run`, then
call `execute_function`:

```python file=./snippets/run_sync.py start=start:sync end=end:sync title="app.py"
```

Run the script with
`EXECUTOR_MAX_MEMORY_LIMIT=4096 uv run --python 3.12 --with unitycatalog-ai==0.4.0 app.py`.

The client needs a running event loop when you create it. Outside one,
`ApiClient(config)` raises `RuntimeError: no running event loop`, which is why
the script creates it in a coroutine. After that, call `execute_function` on
the same client as often as you need.

When the script is done with the client, close its connection:

```python file=./snippets/run_sync.py start=start:close end=end:close
```

:::warning
`client.close()`, a `with` block around the client, and the exit hook the
client registers leave the connection open. Call `close_async()` as shown,
before any of them.
:::

## Call a function from async code

In async code, await `execute_function_async`:

```python file=./snippets/run_async.py start=start:async end=end:async
```

Read the result's `value` and `error` fields: `value` holds what the function
returned, and `error` holds what went wrong while it ran. See
[Handle errors](#handle-errors).

Register synchronous functions only. An `async def` function registers with an
empty body, and every call to it raises `IndentationError`, in either execution
mode.

### Run calls concurrently

A client can't run two calls at once: two concurrent calls on one client, such
as through `asyncio.gather`, deadlock. `slow_quote` stands in for a slow call:

```python file=./snippets/pricing.py start=start:slow-quote end=end:slow-quote title="pricing.py"
```

To run calls concurrently, give each call its own
`UnitycatalogFunctionClient`. The clients can share one `ApiClient`:

```python file=./snippets/run_async.py start=start:concurrent end=end:concurrent
```

The three 2-second calls run at the same time and finish together, in under
4.5 seconds.

### Call from worker threads

A client belongs to the event loop it was created in. Used from another thread
or another event loop, it fails with
`RuntimeError: … attached to a different loop`. A sync call from another
thread can also fail with
`Timeout context manager should be used inside a task`. In a
`ThreadPoolExecutor` or any other worker thread, create the client inside that
worker's own event loop:

```python file=./snippets/run_async.py start=start:worker-client end=end:worker-client
```

### Run on asyncio's default event loop

Importing the client breaks uvloop. Inside a running uvloop loop, the import
raises `ValueError: Can't patch loop of type <class 'uvloop.Loop'>`. After the
import, `uvloop.run` raises
`TypeError: … got an unexpected keyword argument 'loop_factory'`. Run the
application on asyncio's default event loop.

## Call a function in a marimo notebook

Open a notebook with `unitycatalog-ai` and marimo:
`EXECUTOR_MAX_MEMORY_LIMIT=4096 uv run --python 3.12 --with unitycatalog-ai==0.4.0 --with marimo==0.25.1 marimo edit notebook.py`.

marimo's kernel runs the cells, and in it both a top-level `await` and the
synchronous call work. Create the client directly in a cell, without
`asyncio.run`:

```python file=./snippets/notebook.py start=start:nb-connect end=end:nb-connect
```

In another cell, await the call:

```python file=./snippets/notebook.py start=start:nb-await end=end:nb-await
```

The synchronous call works in a cell too:

```python file=./snippets/notebook.py start=start:nb-sync end=end:nb-sync
```

When you're done, close the connection in a cell:

```python file=./snippets/notebook.py start=start:nb-close end=end:nb-close
```

## Choose an execution mode

A client runs functions in `sandbox` mode unless you create it with
`execution_mode="local"`:

```python file=./snippets/modes.py start=start:modes end=end:modes
```

Any other value raises a `ValueError`. The two modes differ in where the
function runs and what it may do:

| | `sandbox` (default) | `local` |
| --- | --- | --- |
| Where the function runs | A child process | Your process: a sync call on the calling thread, an async call on another thread |
| `open` and blocked modules | Refused | Allowed |
| Time and CPU limits | Applied | Ignored |
| `result.error` when the function raises | The full traceback | The exception's message only |

The sandbox blocks imports of `sys`, `subprocess`, `ctypes`, `socket`,
`importlib`, `pickle`, `marshal`, and `shutil`
([`executor_env_vars.py`](https://github.com/unitycatalog/unitycatalog/blob/ai-v0.4.0/ai/core/src/unitycatalog/ai/core/envs/executor_env_vars.py)).
Local mode runs the body in your process with nothing blocked, so use it only
for functions you trust.

To see the difference in error text, take a function that raises:

```python file=./snippets/pricing.py start=start:checked-total end=end:checked-total title="pricing.py"
```

Call it in each mode:

```python file=./snippets/modes.py start=start:error-text end=end:error-text
```

The sandboxed result ends in `ValueError: quantity must be at least 1`. The
local result holds only `quantity must be at least 1`.

:::warning
In local mode, from the third call with the same arguments on, the client
returns the stored result without running the function. A function with side
effects or a time-dependent result returns a stale value. Call
`client.clear_function_cache()`, or create a new client, and the function runs
again until the cache fills again.
:::

## Make dependencies available

In the sandbox, a function can't import a blocked module, and neither can the
packages it imports. `statistics` imports `sys`, and `cloudpickle` imports
`pickle`, so a function that imports either fails with
`The import of module 'sys' is restricted.` (or `'pickle'`). Import the package
in your own code before the call, and the sandboxed function can use it.
`payload_size` imports `cloudpickle` in its body:

```python file=./snippets/pricing.py start=start:payload-size end=end:payload-size title="pricing.py"
```

Import `cloudpickle` first, then call it:

```python file=./snippets/modes.py start=start:preload end=end:preload
```

A function that imports a blocked module itself, such as `import sys` in its
body, still fails.

:::warning
Don't set `EXECUTOR_DISALLOWED_MODULES`. The client reads any value as a list
of single characters, so while the variable is set, the sandbox blocks no
module by name.
:::

## Set time and memory limits

The sandbox stops a call that runs past its limits. You set them with
environment variables, which the client reads on every call:

| Variable | Limits | Default |
| --- | --- | --- |
| `EXECUTOR_TIMEOUT` | Wall-clock time, in seconds | 20 |
| `EXECUTOR_MAX_CPU_TIME_LIMIT` | CPU time, in seconds | 10 |
| `EXECUTOR_MAX_MEMORY_LIMIT` | Virtual memory, in MB, on Linux only | 100 |

The defaults come from
[`executor_env_vars.py`](https://github.com/unitycatalog/unitycatalog/blob/ai-v0.4.0/ai/core/src/unitycatalog/ai/core/envs/executor_env_vars.py).
Local mode ignores the time and CPU limits.

To cap a call's wall-clock time, set `EXECUTOR_TIMEOUT` before the call:

```python file=./snippets/limits.py start=start:wall-clock end=end:wall-clock
```

The call stops after 3 seconds. `result.value` is `None`, and `result.error`
starts with `The function execution has timed out and has been canceled`.
Because the client reads the variable on every call, raising it again lets the
same 8-second wait finish.

The CPU limit counts seconds of CPU time, not waiting, so a function that
sleeps isn't stopped by it. A busy loop is:

```python file=./snippets/pricing.py start=start:busy-total end=end:busy-total title="pricing.py"
```

Set the limit to 1 CPU second and call it:

```python file=./snippets/limits.py start=start:cpu-time end=end:cpu-time
```

`result.error` starts with
`The function execution has been terminated with a signal`: signal 9 on Linux,
24 on macOS.

The memory limit applies on Linux only. macOS ignores it. On Linux, the 100 MB
default is too low for even a small call to succeed, so raise it, as the
session command does with `EXECUTOR_MAX_MEMORY_LIMIT=4096`.

The `timeout` argument of `execute_function_async` isn't an execution limit.
It's the HTTP timeout for fetching the function, so this 2-second call
finishes with `timeout=0.5`:

```python file=./snippets/limits.py start=start:request-timeout end=end:request-timeout
```

## Handle errors

A call fails in one of two ways: the client raises before the function runs,
or the function runs and the result carries an error.

The client checks your arguments against the function's registered parameters
and raises a `ValueError` for a wrong type, a missing parameter, or an extra
one:

```python file=./snippets/errors.py start=start:raised end=end:raised
```

A function that doesn't exist, because it was never registered or was deleted,
raises `AttributeError: 'NoneType' object has no attribute 'input_params'`.

Anything that goes wrong while the function runs comes back in
`result.error`, with `result.value` set to `None`. Check `error` before you
use `value`. In sandbox mode, its last line is the exception, here from
`checked_total`:

```python file=./snippets/errors.py start=start:check-error end=end:check-error
```

Two results need care:

- A function that returns a falsy value, such as `0`, comes back with no
  error and a notice in `value` that starts with
  `The function execution has completed, but no output was produced`.
- A function with a `list` parameter works on the first call. The next call
  with the same list returns `TypeError: unhashable type: 'list'` in `error`.
  Call `client.clear_function_cache()` before every call that passes a list.

## Next steps

- Hand catalog functions to an agent in
  [Use catalog functions as LangChain tools](../langchain-tools/index.md).
- Register, replace, and delete functions in
  [Manage Python functions](../manage-python-functions/index.md).
- Build and run a first function step by step in
  [Working with Python functions](../../tutorials/first-python-function/index.md).

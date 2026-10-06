"""Skip native teardown once a tutorial script has finished cleanly.

``content/conftest.py`` puts this directory on ``PYTHONPATH`` for every script it
runs, so Python imports this module at startup. It never ships with a script.

Why: after a Delta script's last assert passes, the process can deadlock in
``exit()`` while pyarrow's C++ thread pool is destroyed
(``arrow::internal::ThreadPool::~ThreadPool`` waiting on a condition variable).
The work is done, but the test hangs until CI kills the job. The last atexit
handler to run (the first registered, which is this one) calls ``os._exit``
with the script's real exit status. That skips the C-level static destructors
and nothing else: Python's own shutdown (thread joins, other atexit handlers,
flushing) has already happened.

The exit status is reconstructed from what Python exposes: an unhandled
exception means 1, ``sys.exit(code)`` means that code. Anything this can't see
falls through to normal teardown.
"""

from __future__ import annotations

import atexit
import os
import sys

_status: list[int | None] = [0]

_excepthook = sys.excepthook


def _record_exception(exc_type, exc, tb):
    # KeyboardInterrupt and friends: let the interpreter finish normally so
    # the signal-style exit code survives.
    _status[0] = 1 if issubclass(exc_type, Exception) else None
    _excepthook(exc_type, exc, tb)


_exit = sys.exit


def _record_exit(code=None):
    if code is None or isinstance(code, int):
        _status[0] = code or 0
    else:
        # sys.exit("message") prints it and exits 1.
        _status[0] = 1
    _exit(code)


def _fast_exit():
    status = _status[0]
    if status is None:
        return
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.flush()
        except Exception:
            pass
    os._exit(status)


sys.excepthook = _record_exception
sys.exit = _record_exit
atexit.register(_fast_exit)

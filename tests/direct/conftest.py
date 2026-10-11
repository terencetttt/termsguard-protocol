"""Work around genlayer-test's POSIX unlink-open-fd assumption on Windows."""
import os
import tempfile

import pytest
from gltest.direct import loader


@pytest.fixture(autouse=True)
def windows_message_fd_cleanup(monkeypatch):
    if os.name != "nt":
        yield
        return

    original_inject = loader._inject_message_to_fd0
    original_load = loader._load_module
    original_unlink = os.unlink
    pending = []

    def inject(vm):
        original_mkstemp = tempfile.mkstemp

        def capture_temp(*args, **kwargs):
            fd, path = original_mkstemp(*args, **kwargs)
            pending.append((vm, path))
            return fd, path

        def defer_open_file_unlink(path, *args, **kwargs):
            try:
                return original_unlink(path, *args, **kwargs)
            except PermissionError:
                if not any(held_path == path for _, held_path in pending):
                    raise

        monkeypatch.setattr(tempfile, "mkstemp", capture_temp)
        monkeypatch.setattr(os, "unlink", defer_open_file_unlink)
        try:
            original_inject(vm)
        finally:
            monkeypatch.setattr(tempfile, "mkstemp", original_mkstemp)
            monkeypatch.setattr(os, "unlink", original_unlink)

    def load_after_message_injection(path):
        vm, message_path = pending[-1]
        try:
            return original_load(path)
        finally:
            original_stdin = getattr(vm, "_original_stdin_fd", None)
            if original_stdin is not None:
                os.dup2(original_stdin, 0)
                os.close(original_stdin)
                del vm._original_stdin_fd
            original_unlink(message_path)
            pending.pop()

    monkeypatch.setattr(loader, "_inject_message_to_fd0", inject)
    monkeypatch.setattr(loader, "_load_module", load_after_message_injection)
    yield

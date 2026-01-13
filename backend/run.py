import sys
import os
import shlex
import socket
import subprocess
import time
from contextlib import suppress
from pathlib import Path

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import uvicorn


def _load_env() -> None:
    env_path = Path(__file__).with_name('.env')
    if not env_path.exists():
        return

    with env_path.open('r', encoding='utf-8') as env_file:
        for raw_line in env_file:
            line = raw_line.strip()
            if not line or line.startswith('#'):
                continue

            if '#' in line:
                line = line.split('#', 1)[0].strip()
            if not line or '=' not in line:
                continue

            key, value = line.split('=', 1)
            key = key.strip()
            value = value.strip()
            if not key:
                continue

            if value and value[0] in "'\"" and value[-1] == value[0]:
                value = value[1:-1]

            os.environ.setdefault(key, value)


_load_env()


def _is_redis_running(host: str = "127.0.0.1", port: int = 6379) -> bool:
    try:
        with socket.create_connection((host, port), timeout=1):
            return True
    except OSError:
        return False


def _start_redis() -> subprocess.Popen | None:
    redis_cmd = os.environ.get("REDIS_SERVER_PATH", "redis-server")
    args = shlex.split(redis_cmd, posix=False)

    try:
        return subprocess.Popen(args)
    except FileNotFoundError as exc:
        raise RuntimeError(
            "redis-server executable not found. Install Redis or set REDIS_SERVER_PATH"
        ) from exc


def _stop_process(proc: subprocess.Popen | None) -> None:
    if not proc or proc.poll() is not None:
        return

    with suppress(subprocess.TimeoutExpired):
        proc.terminate()
        proc.wait(timeout=5)

    if proc.poll() is None:
        proc.kill()


if __name__ == "__main__":
    redis_process: subprocess.Popen | None = None

    try:
        if not _is_redis_running():
            redis_process = _start_redis()
            time.sleep(0.5)  # give Redis a moment to bind the port

        uvicorn.run("main:app", host="127.0.0.1", port=9000, reload=True, log_level="debug")
    finally:
        _stop_process(redis_process)
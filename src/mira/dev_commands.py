"""Dev workflow entrypoints exposed as `uv run <command>`.

Mirrors the Claire layout: each function here is registered under
``[project.scripts]`` in ``pyproject.toml`` so you can run e.g.

    uv run dev        # start the dashboard server (localhost)
    uv run prod       # start bound to 0.0.0.0 (for tunnels / containers)
    uv run lint       # ruff check
    uv run format     # ruff format
    uv run test       # pytest
    uv run build-ui   # rebuild the React dashboard
    uv run check      # lint + test in one shot

Secrets for local runs are loaded from ``.env.local`` (gitignored) so
the commands below never hardcode keys.
"""

from __future__ import annotations

import os
import subprocess
import sys
from collections.abc import Sequence
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
UI_DIR = PROJECT_ROOT / "ui" / "mira"

# ── shared helpers ───────────────────────────────────────────────────


def _load_env_file(path: Path) -> None:
    """Populate os.environ from a simple KEY=value file (no `export` needed).

    Existing environment variables win — the file only fills gaps, so
    `MIRA_MODEL=foo uv run dev` still overrides the file.
    """
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.removeprefix("export").strip()
        value = value.strip().strip("'\"")
        os.environ.setdefault(key, value)


def _build_env() -> dict[str, str]:
    """Load .env.local then return the env to pass to subprocesses."""
    _load_env_file(PROJECT_ROOT / ".env.local")
    env = os.environ.copy()
    # Make sure the project root is importable when running uvicorn directly.
    pythonpath = env.get("PYTHONPATH", "")
    root_str = str(PROJECT_ROOT)
    env["PYTHONPATH"] = (
        root_str if not pythonpath else f"{root_str}{os.pathsep}{pythonpath}"
    )
    return env


def _run(command: Sequence[str]) -> None:
    result = subprocess.run(command, check=False, cwd=PROJECT_ROOT, env=_build_env())
    raise SystemExit(result.returncode)


def _ensure_dummy_key() -> None:
    """Generate a throwaway RSA key if one isn't already on disk.

    `mira serve` requires GitHub App creds even when you only want the
    dashboard. For local dev we fake them so the server boots without a
    real App — reviews/webhooks won't work, but the dashboard does.
    """
    key_path = PROJECT_ROOT / "private-key.pem"
    if key_path.is_file():
        return
    subprocess.run(
        ["openssl", "genrsa", "-out", str(key_path), "2048"],
        check=True,
        cwd=PROJECT_ROOT,
        env=_build_env(),
        capture_output=True,
    )


# ── servers ──────────────────────────────────────────────────────────


def dev() -> None:
    """Start Mira on 127.0.0.1:8000 — local dashboard dev."""
    _ensure_dummy_key()
    _run(
        [
            "mira",
            "serve",
            "--host",
            "127.0.0.1",
            "--port",
            "8000",
            "--bot-name",
            "miracodeai",
        ]
    )


def prod() -> None:
    """Start Mira bound to 0.0.0.0 (expose via tunnel/container)."""
    _ensure_dummy_key()
    _run(
        [
            "mira",
            "serve",
            "--host",
            "0.0.0.0",
            "--port",
            "8000",
            "--bot-name",
            "miracodeai",
        ]
    )


# ── quality gates ────────────────────────────────────────────────────


def lint() -> None:
    _run(["ruff", "check", "src", "tests"])


def lint_fix() -> None:
    _run(["ruff", "check", "--fix", "src", "tests"])


def format_code() -> None:
    _run(["ruff", "format", "src", "tests"])


def typecheck() -> None:
    _run(["mypy", "src"])


def test() -> None:
    _run(["pytest", "tests", "-v"])


def test_cov() -> None:
    _run(["pytest", "--cov=src/mira", "--cov-report=term-missing", "tests", "-v"])


# ── UI ───────────────────────────────────────────────────────────────


def build_ui() -> None:
    """Install (if needed) and build the React dashboard into ui/mira/dist."""
    if not (UI_DIR / "node_modules").is_dir():
        print("Installing UI dependencies...")
        subprocess.run(["npm", "install"], check=True, cwd=UI_DIR, env=_build_env())
    print("Building UI...")
    result = subprocess.run(
        ["npm", "run", "build"], check=False, cwd=UI_DIR, env=_build_env()
    )
    raise SystemExit(result.returncode)


def dev_ui() -> None:
    """Run the Vite dev server (hot reload) for the dashboard UI."""
    if not (UI_DIR / "node_modules").is_dir():
        subprocess.run(["npm", "install"], check=True, cwd=UI_DIR, env=_build_env())
    result = subprocess.run(
        ["npm", "run", "dev"], check=False, cwd=UI_DIR, env=_build_env()
    )
    raise SystemExit(result.returncode)


# ── combined ─────────────────────────────────────────────────────────


def check() -> None:
    """Lint + test in one shot. Exits non-zero if anything fails."""
    env = _build_env()
    subprocess.run(["ruff", "check", "src", "tests"], check=True, cwd=PROJECT_ROOT, env=env)
    result = subprocess.run(
        ["pytest", "tests", "-v"], check=False, cwd=PROJECT_ROOT, env=env
    )
    raise SystemExit(result.returncode)


def doctor() -> None:
    """Diagnose the local setup. Prints a checklist of what's wired up.

    Run `uv run doctor` any time the dashboard feels broken — it checks
    each dependency (env vars, token reachability, model registry, UI
    build) and tells you exactly what to fix.
    """
    env = _build_env()

    def _ok(msg: str) -> None:
        print(f"  [OK]   {msg}")

    def _fail(msg: str, fix: str = "") -> None:
        print(f"  [FAIL] {msg}")
        if fix:
            print(f"         -> {fix}")

    print("Mira local diagnostics")
    print("=" * 60)

    # 1. Python deps present
    print("\n1. Python package")
    try:
        import mira  # noqa: F401

        _ok("mira imports")
    except Exception as exc:
        _fail(f"mira import failed: {exc}", "uv sync --extra serve --extra dev")

    # 2. LLM key
    print("\n2. LLM (OpenRouter)")
    or_key = env.get("OPENROUTER_API_KEY", "")
    if or_key and or_key != "sk-or-v1-your-key-here":
        _ok("OPENROUTER_API_KEY is set")
    else:
        _fail(
            "OPENROUTER_API_KEY missing or placeholder",
            "add it to .env.local (get one at openrouter.ai)",
        )

    model = env.get("MIRA_MODEL", "")
    if model:
        try:
            from mira.llm.registry import is_supported

            if is_supported(model, purpose="indexing") and is_supported(
                model, purpose="review"
            ):
                _ok(f"MIRA_MODEL={model} is supported for indexing+review")
            else:
                _fail(
                    f"MIRA_MODEL={model} is not in models.json",
                    "add it to src/mira/llm/models.json",
                )
        except Exception as exc:
            _fail(f"could not check model registry: {exc}")
    else:
        _fail("MIRA_MODEL not set", "set it in .env.local")

    # 3. GitHub token — the most common reason indexing fails
    print("\n3. GitHub (needed to index manually-added repos)")
    gh_token = env.get("GITHUB_TOKEN", "")
    if gh_token:
        _ok("GITHUB_TOKEN is set")
        # Reachability check
        import urllib.error
        import urllib.request

        try:
            req = urllib.request.Request(
                "https://api.github.com/rate_limit",
                headers={"Authorization": f"Bearer {gh_token}"},
            )
            with urllib.request.urlopen(req, timeout=8) as resp:  # noqa: S310
                if resp.status == 200:
                    _ok("GitHub token is valid (rate_limit responded 200)")
                else:
                    _fail(f"GitHub token check returned {resp.status}")
        except urllib.error.HTTPError as exc:
            _fail(
                f"GitHub rejected token (HTTP {exc.code})",
                "regenerate at github.com/settings/tokens",
            )
        except Exception as exc:
            _fail(f"GitHub token check failed: {exc}")
    else:
        _fail(
            "GITHUB_TOKEN is NOT set",
            "create a classic read-only PAT at "
            "github.com/settings/tokens/new and add to .env.local",
        )

    # 4. Dashboard auth
    print("\n4. Dashboard auth")
    if env.get("ADMIN_PASSWORD"):
        _ok("ADMIN_PASSWORD is set")
    else:
        _fail("ADMIN_PASSWORD missing", "add to .env.local (default is 'admin')")

    # 5. UI build
    print("\n5. Dashboard UI")
    dist = UI_DIR / "dist" / "index.html"
    if dist.is_file():
        _ok(f"UI built ({UI_DIR / 'dist'})")
    else:
        _fail("UI not built", "uv run build-ui")

    # 6. Dummy GitHub App key (needed for `mira serve` to boot)
    print("\n6. Serve prerequisites")
    if (PROJECT_ROOT / "private-key.pem").is_file():
        _ok("private-key.pem present (dummy is fine for local)")
    else:
        _ok("private-key.pem will be auto-generated by `uv run dev`")

    print("\n" + "=" * 60)
    print("Done. Fix any [FAIL] lines above, then `uv run dev`.")


# Keep an explicit __all__ so `[project.scripts]` targets are unambiguous.
__all__ = [
    "dev",
    "prod",
    "lint",
    "lint_fix",
    "format_code",
    "typecheck",
    "test",
    "test_cov",
    "build_ui",
    "dev_ui",
    "check",
    "doctor",
]

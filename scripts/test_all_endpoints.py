"""Smoke-test every dashboard endpoint against the running server.

Usage:
    uv run python scripts/test_all_endpoints.py

Hits each route, prints [OK]/[FAIL] with the HTTP code and a short body
snippet, then a summary. Designed to surface broken flows without you
having to click through the UI.
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8000"
# Use a known repo we added earlier. Adjust if you removed it.
REPO_OWNER = "sanketpatel32"
REPO_NAME = "Code-reviewer"

results: list[tuple[str, str, int, str]] = []


def _login() -> str:
    """Log in and return the session cookie value."""
    req = urllib.request.Request(
        f"{BASE}/api/auth/login",
        data=json.dumps({"username": "admin", "password": "admin"}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        # Session cookie is in Set-Cookie
        cookie_header = resp.headers.get("Set-Cookie", "")
        for part in cookie_header.split(";"):
            part = part.strip()
            if part.startswith("mira_session="):
                return part.removeprefix("mira_session=")
    raise RuntimeError("login did not return a session cookie")


def _req(method: str, path: str, cookie: str, body: dict | None = None) -> tuple[int, str]:
    url = f"{BASE}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Cookie": f"mira_session={cookie}",
        },
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            text = resp.read().decode(errors="replace")
            return resp.status, text
    except urllib.error.HTTPError as exc:
        text = exc.read().decode(errors="replace")
        return exc.code, text
    except Exception as exc:  # noqa: BLE001
        return -1, str(exc)


def check(label: str, method: str, path: str, cookie: str, body: dict | None = None,
          expect: int = 200) -> int:
    code, text = _req(method, path, cookie, body)
    snippet = text[:120].replace("\n", " ")
    status = "OK" if code == expect else "FAIL"
    results.append((status, label, code, snippet))
    print(f"  [{status}] {code:3d}  {label}", flush=True)
    if status == "FAIL":
        print(f"           expected {expect}, got {code}: {snippet}", flush=True)
    return code


def main() -> int:
    print("=" * 70)
    print("Mira dashboard endpoint smoke test")
    print("=" * 70)

    try:
        cookie = _login()
    except Exception as exc:  # noqa: BLE001
        print(f"[FATAL] could not login: {exc}", flush=True)
        print("        is `uv run dev` running on 127.0.0.1:8000?", flush=True)
        return 1
    print("  [OK]   login (session acquired)\n", flush=True)

    full = f"{REPO_OWNER}/{REPO_NAME}"

    # ── System / global ──────────────────────────────────────────────
    print("── System / global ──")
    check("GET /api/version", "GET", "/api/version", cookie)
    check("GET /api/setup/status", "GET", "/api/setup/status", cookie)
    check("GET /api/settings/models", "GET", "/api/settings/models", cookie)
    check("GET /api/activity", "GET", "/api/activity", cookie)
    check("GET /api/stats", "GET", "/api/stats", cookie)
    check("GET /api/stats/timeseries", "GET", "/api/stats/timeseries?period=day", cookie)
    check("GET /api/indexing/status", "GET", "/api/indexing/status", cookie)
    check("GET /api/indexing/estimate", "GET", "/api/indexing/estimate", cookie)
    check("GET /api/uninstalls/pending", "GET", "/api/uninstalls/pending", cookie)
    check("GET /api/vulnerabilities", "GET", "/api/vulnerabilities", cookie)
    check("GET /api/vulnerabilities/summary", "GET", "/api/vulnerabilities/summary", cookie)
    check("GET /api/packages/search", "GET", "/api/packages/search?q=requests", cookie)
    check("GET /api/relationships", "GET", "/api/relationships", cookie)
    check("GET /api/relationships/custom", "GET", "/api/relationships/custom", cookie)
    check("GET /api/relationships/overrides", "GET", "/api/relationships/overrides", cookie)
    check("GET /api/rules/global", "GET", "/api/rules/global", cookie)
    check("GET /api/learned-rules", "GET", "/api/learned-rules", cookie)

    # /api/events is an SSE stream — it never closes by design. Read just
    # the first chunk (the ": connected" handshake) with a short timeout,
    # then close the connection. We can't use urlopen because it waits
    # for EOF; use a raw socket instead.
    print("\n── SSE stream ──")
    import socket
    s = socket.create_connection(("127.0.0.1", 8000), timeout=5)
    s.settimeout(5)
    try:
        req_bytes = (
            "GET /api/events HTTP/1.1\r\n"
            "Host: 127.0.0.1:8000\r\n"
            f"Cookie: mira_session={cookie}\r\n"
            "Accept: text/event-stream\r\n"
            "Connection: close\r\n\r\n"
        ).encode()
        s.sendall(req_bytes)
        # Read enough to get headers + the first SSE data line
        data = b""
        try:
            while b": connected" not in data and len(data) < 2048:
                data += s.recv(512)
        except (TimeoutError, OSError):
            pass
        chunk = data.decode(errors="replace")
        status = "OK" if "200 OK" in chunk and "connected" in chunk else "FAIL"
        first_line = next(
            (ln for ln in chunk.splitlines() if ln.startswith(":")), ""
        )
        print(f"  [{status}] GET /api/events (SSE) — {first_line!r}", flush=True)
        results.append((status, "GET /api/events (SSE)", 200, first_line))
    except Exception as exc:  # noqa: BLE001
        print(f"  [FAIL] GET /api/events (SSE) — {exc}", flush=True)
        results.append(("FAIL", "GET /api/events (SSE)", -1, str(exc)))
    finally:
        s.close()

    # ── Admin ────────────────────────────────────────────────────────
    print("\n── Admin ──")
    check("GET /api/admin/settings", "GET", "/api/admin/settings", cookie)
    check("GET /api/admin/webhooks", "GET", "/api/admin/webhooks", cookie)

    # ── Repos: list + detail ────────────────────────────────────────
    print("\n── Repos ──")
    check("GET /api/repos", "GET", "/api/repos", cookie)
    check(f"GET /api/repos/{full}", "GET", f"/api/repos/{full}", cookie)
    check(f"GET /api/repos/{full}/files", "GET", f"/api/repos/{full}/files", cookie)
    check(f"GET /api/repos/{full}/dependencies", "GET", f"/api/repos/{full}/dependencies", cookie)
    check(f"GET /api/repos/{full}/external-refs", "GET", f"/api/repos/{full}/external-refs", cookie)
    check(f"GET /api/repos/{full}/packages", "GET", f"/api/repos/{full}/packages", cookie)
    check(f"GET /api/repos/{full}/vulnerabilities", "GET", f"/api/repos/{full}/vulnerabilities", cookie)
    check(f"GET /api/repos/{full}/blast-radius", "GET", f"/api/repos/{full}/blast-radius", cookie)
    check(f"GET /api/repos/{full}/blast-radius.svg", "GET", f"/api/repos/{full}/blast-radius.svg", cookie)
    check(f"GET /api/repos/{full}/reviews", "GET", f"/api/repos/{full}/reviews", cookie)
    check(f"GET /api/repos/{full}/rules", "GET", f"/api/repos/{full}/rules", cookie)
    check(f"GET /api/repos/{full}/context", "GET", f"/api/repos/{full}/context", cookie)
    check(f"GET /api/repos/{full}/learned-rules", "GET", f"/api/repos/{full}/learned-rules", cookie)
    check(f"GET /api/relationships/{full}", "GET", f"/api/relationships/{full}", cookie)

    # ── Mutating flows (create -> list -> update -> delete) ─────────
    print("\n── Context CRUD ──")
    code = check("POST /api/repos/{o}/{r}/context", "POST", f"/api/repos/{full}/context",
                 cookie, {"title": "Test context", "content": "smoke test body"})
    ctx_id = None
    if code == 200:
        # Grab the id from the response we just made
        _, text = _req("GET", f"/api/repos/{full}/context", cookie)
        try:
            ctx_id = json.loads(text)[-1]["id"]
        except Exception:  # noqa: BLE001
            pass
    if ctx_id is not None:
        check("PUT /api/repos/{o}/{r}/context/{id}", "PUT", f"/api/repos/{full}/context/{ctx_id}",
              cookie, {"title": "Updated", "content": "updated body"})
        check("DELETE /api/repos/{o}/{r}/context/{id}", "DELETE",
              f"/api/repos/{full}/context/{ctx_id}", cookie, expect=200)

    print("\n── Rules CRUD ──")
    code = check("POST /api/repos/{o}/{r}/rules", "POST", f"/api/repos/{full}/rules",
                 cookie, {"title": "No eval()", "content": "Reject calls to eval()"})
    rule_id = None
    if code == 200:
        _, text = _req("GET", f"/api/repos/{full}/rules", cookie)
        try:
            rule_id = json.loads(text)[-1]["id"]
        except Exception:  # noqa: BLE001
            pass
    if rule_id is not None:
        check("PUT /api/repos/{o}/{r}/rules/{id}", "PUT", f"/api/repos/{full}/rules/{rule_id}",
              cookie, {"title": "No eval()", "content": "Reject calls to eval()"})
        check("DELETE /api/repos/{o}/{r}/rules/{id}", "DELETE",
              f"/api/repos/{full}/rules/{rule_id}", cookie, expect=200)

    print("\n── Global rules CRUD ──")
    code = check("POST /api/rules/global", "POST", "/api/rules/global",
                 cookie, {"title": "No console.log", "content": "Reject console.log in production"})
    grule_id = None
    if code == 200:
        _, text = _req("GET", "/api/rules/global", cookie)
        try:
            grule_id = json.loads(text)[-1]["id"]
        except Exception:  # noqa: BLE001
            pass
    if grule_id is not None:
        check("PATCH /api/rules/global/{id}/toggle", "PATCH",
              f"/api/rules/global/{grule_id}/toggle", cookie)
        check("PUT /api/rules/global/{id}", "PUT", f"/api/rules/global/{grule_id}",
              cookie, {"title": "No console.log", "content": "Reject console.log in production"})
        check("DELETE /api/rules/global/{id}", "DELETE",
              f"/api/rules/global/{grule_id}", cookie, expect=200)

    # ── Add repo (manual) + remove ──────────────────────────────────
    print("\n── Add / remove repo (manual) ──")
    code = check("POST /api/repos (add test repo)", "POST", "/api/repos",
                 cookie, {"repo": "miracodeai/mira"})
    if code == 200:
        check("DELETE /api/repos/{o}/{r} (miracodeai/mira)", "DELETE",
              "/api/repos/miracodeai/mira", cookie, expect=200)

    # ── Settings (models) ───────────────────────────────────────────
    print("\n── Settings ──")
    # Read current, write same back
    _, text = _req("GET", "/api/settings/models", cookie)
    try:
        current = json.loads(text)
        check("PUT /api/settings/models", "PUT", "/api/settings/models", cookie, {
            "indexing_model": current["indexing_model"],
            "review_model": current["review_model"],
            "review_thinking_mode": current["review_thinking_mode"],
        })
    except Exception:  # noqa: BLE001
        print("  [SKIP] could not read current model settings")

    # ── Summary ─────────────────────────────────────────────────────
    print("\n" + "=" * 70)
    ok = sum(1 for s, *_ in results if s == "OK")
    fail = sum(1 for s, *_ in results if s == "FAIL")
    print(f"Results: {ok} OK, {fail} FAIL, {len(results)} total")
    if fail:
        print("\nFailed checks:")
        for status, label, code, snippet in results:
            if status == "FAIL":
                print(f"  - {label}: HTTP {code} — {snippet}")
        return 1
    print("\nAll endpoints passed. ✓")
    return 0


if __name__ == "__main__":
    sys.exit(main())

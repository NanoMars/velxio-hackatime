#!/usr/bin/env python3
"""
End-to-end test against https://velxio.armand.sh:

  1. POST /api/compile with the user's sketch → get base64 firmware
  2. Open WebSocket /api/simulation/ws/<clientId>
  3. Send `start_esp32` with firmware + wifi_enabled=true
  4. Read incoming messages until wifi_status.status == 'got_ip'
  5. GET /api/gateway/<clientId>/ → expect HTML containing the injected
     fetch shim (__velxio_gateway_patched__)
  6. GET /api/gateway/<clientId>/api/entries → expect '[]'
  7. POST /api/gateway/<clientId>/api/entries (form data) → expect ok
  8. GET /api/gateway/<clientId>/api/entries → expect an entry
  9. Send `stop_esp32`, close WebSocket

Exit 0 on full success, 1 on any failure.
"""
import asyncio
import base64
import json
import sys
import time
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

import websockets

API = "https://velxio.armand.sh"
WS = "wss://velxio.armand.sh"
BOARD_FQBN = "esp32:esp32:esp32"
BOARD_KIND = "esp32-devkit-c-v4"
SRC_DIR = Path("/tmp/velxio-test")


def log(msg: str) -> None:
    ts = time.strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def http_post_json(url: str, payload: dict, timeout: float = 600.0) -> dict:
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        url, data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def http_get(url: str, timeout: float = 30.0) -> tuple[int, bytes]:
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def http_post_form(url: str, form: dict, timeout: float = 30.0) -> tuple[int, bytes]:
    body = urllib.parse.urlencode(form).encode()
    req = urllib.request.Request(
        url, data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def load_sketch_files() -> list[dict]:
    files = []
    for name in ("sketch.ino", "html.h"):
        p = SRC_DIR / name
        if p.exists():
            files.append({"name": name, "content": p.read_text()})
    return files


async def run_esp32_and_verify(firmware_b64: str) -> bool:
    session_id = str(uuid.uuid4())
    board_id = "esp32-devkit-c-v4"
    client_id = f"{session_id}::{board_id}"
    ws_url = f"{WS}/api/simulation/ws/{urllib.parse.quote(client_id, safe='')}"

    log(f"client_id: {client_id}")
    log(f"connecting to {ws_url}")

    async with websockets.connect(ws_url, max_size=None) as ws:
        log("websocket connected")

        start_msg = {
            "type": "start_esp32",
            "data": {
                "board": BOARD_KIND,
                "firmware_b64": firmware_b64,
                "sensors": [],
                "wifi_enabled": True,
            },
        }
        await ws.send(json.dumps(start_msg))
        log("sent start_esp32")

        got_ip = False
        deadline = time.time() + 90.0
        serial_buf = ""

        while time.time() < deadline:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=5.0)
            except asyncio.TimeoutError:
                continue
            try:
                msg = json.loads(raw)
            except Exception:
                continue

            etype = msg.get("type", "")
            data = msg.get("data", {})

            if etype == "serial_output":
                serial_buf += data.get("data", "")
                # Only print tail for sanity
                if "IP:" in serial_buf or "Web server started" in serial_buf:
                    pass
            elif etype == "wifi_status":
                log(f"wifi_status: {data}")
                if data.get("status") == "got_ip":
                    got_ip = True
                    break
            elif etype == "system":
                log(f"system: {data}")

        if not got_ip:
            log("TIMEOUT waiting for got_ip")
            log("--- serial tail ---")
            for line in serial_buf.splitlines()[-15:]:
                log(f"  {line}")
            return False

        log("got_ip received, waiting 2s for web server to be ready")
        await asyncio.sleep(2.0)

        # ── HTTP tests through gateway ────────────────────────────────────────
        client_enc = urllib.parse.quote(client_id, safe="")
        base = f"{API}/api/gateway/{client_enc}"

        log(f"GET {base}/")
        status, body = http_get(f"{base}/")
        log(f"  → HTTP {status}, {len(body)} bytes")
        if status != 200:
            log(f"  BODY: {body[:200]!r}")
            return False
        text = body.decode("utf-8", errors="replace")
        if "__velxio_gateway_patched__" not in text:
            log("  FAIL: fetch shim not injected into HTML")
            return False
        log("  OK: fetch shim present")

        log(f"GET {base}/api/entries")
        status, body = http_get(f"{base}/api/entries")
        log(f"  → HTTP {status}, body={body!r}")
        if status != 200 or body.strip() != b"[]":
            log("  FAIL: expected [] from /api/entries on fresh boot")
            return False
        log("  OK: got empty array")

        log(f"POST {base}/api/entries (guestbook entry)")
        status, body = http_post_form(
            f"{base}/api/entries",
            {"name": "test-bot", "message": "hello from automated test"},
        )
        log(f"  → HTTP {status}, body={body!r}")
        if status != 200:
            log("  FAIL: POST returned non-200")
            return False

        log(f"GET {base}/api/entries (should have 1 entry)")
        status, body = http_get(f"{base}/api/entries")
        log(f"  → HTTP {status}, body={body!r}")
        try:
            entries = json.loads(body.decode())
        except Exception:
            log("  FAIL: response not JSON")
            return False
        if not isinstance(entries, list) or len(entries) != 1:
            log(f"  FAIL: expected 1 entry, got {entries!r}")
            return False
        if entries[0].get("name") != "test-bot":
            log(f"  FAIL: entry name wrong: {entries[0]!r}")
            return False
        log("  OK: entry persisted and retrievable")

        # Cleanup
        await ws.send(json.dumps({"type": "stop_esp32", "data": {}}))
        log("sent stop_esp32")

    return True


async def main() -> int:
    log("=== velxio end-to-end gateway test ===")

    files = load_sketch_files()
    log(f"loaded {len(files)} files: {[f['name'] for f in files]}")

    log("POST /api/compile/")
    result = http_post_json(f"{API}/api/compile/", {"files": files, "board_fqbn": BOARD_FQBN})
    if not result.get("success"):
        log(f"FAIL: compile failed: {result.get('error')}")
        return 1
    firmware = result.get("binary_content")
    if not firmware:
        log("FAIL: no binary_content in compile response")
        return 1
    log(f"compile OK: {len(firmware)} base64 chars, has_wifi={result.get('has_wifi')}")

    ok = await run_esp32_and_verify(firmware)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

"""
IoT Gateway — HTTP reverse proxy for ESP32 web servers running in QEMU.

When an ESP32 sketch starts a WebServer on port 80, QEMU's slirp
networking with hostfwd exposes it on a dynamic host port.  This
endpoint proxies HTTP requests from the browser to that host port,
enabling users to interact with their simulated ESP32 HTTP server.

URL pattern:
    /api/gateway/{client_id}/{path}
    →  http://127.0.0.1:{hostfwd_port}/{path}

The gateway also rewrites HTML responses on the fly so that absolute
URLs in the sketch's HTML (href="/x", fetch("/x"), action="/x") go
back through the gateway instead of hitting the Velxio origin. Without
this rewrite, `fetch('/api/entries')` on a page served from
`/api/gateway/<id>/` would resolve to `https://velxio.armand.sh/api/entries`
(the Velxio backend, which doesn't have that route) instead of the
ESP32's web server.
"""
import logging
import re

import httpx
from fastapi import APIRouter, Request, Response

from app.services.esp32_lib_manager import esp_lib_manager

router = APIRouter()
logger = logging.getLogger(__name__)


def _rewrite_html(body: bytes, prefix: str) -> bytes:
    """
    Rewrite an HTML response so absolute URLs stay inside the gateway.

    Two changes:
      1. Inject a tiny <script> at the top of <head> that patches
         window.fetch and XMLHttpRequest.prototype.open to prepend the
         gateway prefix to any URL that starts with '/' (but not '//').
         This covers the common case — SPAs and sketches that call
         fetch('/api/...') from inline scripts.
      2. Regex-rewrite href="/...", src="/...", and action="/..."
         attributes in raw HTML. This catches <a>, <form>, <img>, <link>
         and <script> tags without needing a full HTML parser.

    Both rewrites are idempotent: the injected script checks for a
    marker and the regex skips URLs that already start with the prefix.
    """
    try:
        text = body.decode('utf-8')
    except UnicodeDecodeError:
        # Not UTF-8 HTML (binary, etc.) — don't touch it.
        return body

    if '__velxio_gateway_patched__' in text:
        return body  # Already patched (shouldn't happen but be safe)

    shim = (
        "<script>(function(){"
        "if(window.__velxio_gateway_patched__)return;"
        "window.__velxio_gateway_patched__=true;"
        f"var P={prefix!r};"
        "function fix(u){"
        "if(typeof u!=='string')return u;"
        "if(u.length>0&&u[0]==='/'&&(u.length<2||u[1]!=='/')&&u.indexOf(P)!==0){return P+u;}"
        "return u;"
        "}"
        "var of=window.fetch;"
        "if(of){window.fetch=function(i,o){"
        "if(typeof i==='string')i=fix(i);"
        "else if(i&&i.url)try{i=new Request(fix(i.url),i);}catch(e){}"
        "return of.call(this,i,o);};}"
        "var oo=XMLHttpRequest.prototype.open;"
        "XMLHttpRequest.prototype.open=function(m,u){"
        "arguments[1]=fix(u);"
        "return oo.apply(this,arguments);};"
        "})();</script>"
    )

    # Inject the shim right after <head> or at the very top if no <head>.
    # Case-insensitive match.
    head_match = re.search(r'<head[^>]*>', text, re.IGNORECASE)
    if head_match:
        insert_at = head_match.end()
        text = text[:insert_at] + shim + text[insert_at:]
    else:
        text = shim + text

    # Rewrite href/src/action attributes that start with a single '/'.
    # Skip '//' (protocol-relative) and URLs already starting with the prefix.
    attr_re = re.compile(
        r'''(\s(?:href|src|action)\s*=\s*["'])(/(?!/)[^"']*)''',
        re.IGNORECASE,
    )

    def _sub(m: re.Match) -> str:
        attr, url = m.group(1), m.group(2)
        if url.startswith(prefix):
            return attr + url
        return attr + prefix + url

    text = attr_re.sub(_sub, text)

    return text.encode('utf-8')


@router.api_route(
    '/{client_id}/{path:path}',
    methods=['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
)
async def gateway_proxy(client_id: str, path: str, request: Request) -> Response:
    """Reverse-proxy an HTTP request to the ESP32's web server."""
    inst = esp_lib_manager.get_instance(client_id)
    if not inst or not inst.wifi_enabled or inst.wifi_hostfwd_port == 0:
        return Response(
            content='{"error":"No WiFi-enabled ESP32 instance found for this client"}',
            status_code=404,
            media_type='application/json',
        )

    target_url = f'http://127.0.0.1:{inst.wifi_hostfwd_port}/{path}'
    body = await request.body()

    # Forward relevant headers (skip hop-by-hop)
    skip_headers = {'host', 'transfer-encoding', 'connection'}
    headers = {
        k: v for k, v in request.headers.items()
        if k.lower() not in skip_headers
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.request(
                method=request.method,
                url=target_url,
                content=body,
                headers=headers,
            )
    except httpx.ConnectError:
        return Response(
            content='{"error":"ESP32 HTTP server is not responding. Make sure your sketch starts a WebServer on port 80."}',
            status_code=502,
            media_type='application/json',
        )
    except httpx.TimeoutException:
        return Response(
            content='{"error":"ESP32 HTTP server timed out"}',
            status_code=504,
            media_type='application/json',
        )

    # Forward response back to browser
    resp_headers = dict(resp.headers)
    # Remove hop-by-hop headers
    for h in ('transfer-encoding', 'connection', 'content-encoding'):
        resp_headers.pop(h, None)

    # If this is an HTML response, rewrite absolute-root URLs to go
    # back through the gateway. Otherwise the sketch's fetch('/api/x')
    # calls would hit the Velxio origin instead of the ESP32.
    content = resp.content
    content_type = resp.headers.get('content-type', '')
    if content_type.startswith('text/html') and content:
        # Gateway prefix must end without a trailing slash so "/x" → "/prefix/x"
        prefix = f'/api/gateway/{client_id}'
        content = _rewrite_html(content, prefix)
        # Content-Length is now wrong; let Response recompute it.
        resp_headers.pop('content-length', None)

    return Response(
        content=content,
        status_code=resp.status_code,
        headers=resp_headers,
        media_type=resp.headers.get('content-type'),
    )

#!/usr/bin/env bash
set -euo pipefail

cd "${ORACULO_FRONTEND_ROOT:-/opt/oraculo/current/frontend}"
exec /usr/bin/python3 - <<'PY'
import os
import http.server
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path.cwd().resolve()
INDEX = ROOT / "index.html"
HOST = os.environ.get("ORACULO_WEB_HOST", "127.0.0.1")
PORT = int(os.environ.get("ORACULO_WEB_PORT", "8080"))


class SpaRequestHandler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        parsed_path = urlparse(path).path
        raw_path = unquote(parsed_path).lstrip("/")
        requested = (ROOT / raw_path).resolve()

        try:
            requested.relative_to(ROOT)
        except ValueError:
            return str(ROOT / "__not_found__")

        if requested.is_file() or requested.is_dir():
            return str(requested)

        suffix = Path(parsed_path).suffix
        if suffix:
            return str(requested)

        return str(INDEX)


http.server.ThreadingHTTPServer((HOST, PORT), SpaRequestHandler).serve_forever()
PY

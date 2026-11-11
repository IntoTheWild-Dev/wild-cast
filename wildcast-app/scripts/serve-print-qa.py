"""Local-only authenticated print-QA sidecar. Not a public production server."""
import hashlib
import hmac
import importlib.util
import json
import os
from pathlib import Path
import tempfile
from http.server import BaseHTTPRequestHandler, HTTPServer

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('ink_report', ROOT / 'scripts/composed-ink-report.py')
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)
PROFILES = {hashlib.sha256(p.read_bytes()).hexdigest(): p for p in (ROOT / 'api/icc').glob('*.icc')}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # Do not log bearer credentials, artwork, or request paths.

    def do_GET(self):
        if self.path != '/health':
            self.send_error(404)
            return
        self.send_response(204)
        self.end_headers()

    def do_POST(self):
        secret = os.environ.get('PRINT_QA_TOKEN', '')
        if len(secret) < 32 or not hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + secret):
            self.send_error(401)
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            profile = PROFILES.get(self.headers.get('X-ICC-SHA256'))
            if self.path != '/check' or self.headers.get('Content-Type') != 'application/pdf' or not 0 < size <= 20_000_000 or not profile:
                self.send_error(400)
                return
            self.connection.settimeout(50)
            pdf = self.rfile.read(size)
            if len(pdf) != size or not pdf.startswith(b'%PDF-'):
                self.send_error(400)
                return
            with tempfile.TemporaryDirectory(prefix='wildcast-qa-') as temporary:
                path = Path(temporary) / 'input.pdf'
                path.write_bytes(pdf)
                report = renderer.composed_report(path, profile, dpi=150, limit=300, tolerance=0)
            report.pop('file', None)
            report['pdf_sha256'] = hashlib.sha256(pdf).hexdigest()
            body = json.dumps(report).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(body)
        except Exception:
            self.send_error(503, 'Print validation unavailable')


if __name__ == '__main__':
    if len(os.environ.get('PRINT_QA_TOKEN', '')) < 32:
        raise SystemExit('Set PRINT_QA_TOKEN to a private value of at least 32 characters.')
    HTTPServer(('127.0.0.1', int(os.environ.get('PRINT_QA_PORT', '8767'))), Handler).serve_forever()

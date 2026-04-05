import sys
import json
import tempfile
import cgi
from pathlib import Path
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "parser"))

import pandas as pd
from parse_transactions import parse_account_statement


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_type = self.headers.get("Content-Type", "")
        content_length = int(self.headers.get("Content-Length", 0))

        form = cgi.FieldStorage(
            fp=self.rfile,
            headers=self.headers,
            environ={
                "REQUEST_METHOD": "POST",
                "CONTENT_TYPE": content_type,
                "CONTENT_LENGTH": str(content_length),
            },
        )

        if "file" not in form:
            self._json(400, {"detail": "No file uploaded"})
            return

        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(form["file"].file.read())
            tmp_path = Path(tmp.name)

        try:
            df = parse_account_statement(tmp_path)
            if "date" in df.columns:
                df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
            rows = df.where(pd.notna(df), None).to_dict(orient="records")
            self._json(200, {"type": "transactions", "rows": rows})
        except Exception as e:
            self._json(422, {"detail": str(e)})
        finally:
            tmp_path.unlink(missing_ok=True)

    def _json(self, status: int, body: dict):
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(payload)

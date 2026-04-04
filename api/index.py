"""
Vercel Python serverless function — PDF parser.
Mounted at /api/parse/* via vercel.json rewrites.
"""

import sys
from pathlib import Path

# Make parser/ importable
sys.path.insert(0, str(Path(__file__).parent.parent / "parser"))

from main import app  # noqa: E402 — FastAPI app from parser/main.py

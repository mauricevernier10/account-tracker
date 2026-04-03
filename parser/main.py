"""
FastAPI microservice for parsing Trade Republic PDFs.
Stateless — receives a PDF, returns structured JSON.
"""

import io
import tempfile
from pathlib import Path

import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from parse_depot import parse_pdf as _parse_depot
from parse_transactions import parse_transactions as _parse_transactions

app = FastAPI(title="Account Tracker Parser", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://*.vercel.app"],
    allow_methods=["POST"],
    allow_headers=["*"],
)


def _df_to_records(df: pd.DataFrame) -> list[dict]:
    """Convert DataFrame to JSON-serialisable records."""
    return df.where(pd.notna(df), None).to_dict(orient="records")


@app.post("/parse/portfolio")
async def parse_portfolio(file: UploadFile = File(...)):
    """Parse a monthly portfolio snapshot PDF."""
    if file.content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    contents = await file.read()
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(contents)
        tmp_path = Path(tmp.name)

    try:
        df = _parse_depot(tmp_path)
        # Normalise date to ISO string
        if "statement_date" in df.columns:
            df["statement_date"] = pd.to_datetime(df["statement_date"]).dt.strftime(
                "%Y-%m-%d"
            )
        return {"type": "portfolio", "rows": _df_to_records(df)}
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))
    finally:
        tmp_path.unlink(missing_ok=True)


@app.post("/parse/transactions")
async def parse_transactions(file: UploadFile = File(...)):
    """Parse a Trade Republic account statement PDF (transactions)."""
    if file.content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    contents = await file.read()
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(contents)
        tmp_path = Path(tmp.name)

    try:
        df = _parse_transactions(tmp_path)
        if "date" in df.columns:
            df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
        return {"type": "transactions", "rows": _df_to_records(df)}
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))
    finally:
        tmp_path.unlink(missing_ok=True)


@app.get("/health")
def health():
    return {"status": "ok"}

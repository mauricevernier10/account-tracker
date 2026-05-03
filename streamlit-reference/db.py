"""
SQLite storage layer for the Trade Republic Portfolio dashboard.

DB location: output/portfolio.db

Tables:
  holdings     — one row per (statement_date, isin)
  targets      — one row per isin with target_weight
  transactions — one row per account transaction (trades, transfers, dividends, …)
"""

import sqlite3
from pathlib import Path

import pandas as pd

_HERE = Path(__file__).parent
DB_PATH = _HERE / "output" / "portfolio.db"

_DDL = """
CREATE TABLE IF NOT EXISTS holdings (
    statement_date TEXT NOT NULL,
    depot          TEXT NOT NULL,
    name           TEXT NOT NULL,
    isin           TEXT NOT NULL,
    shares         REAL NOT NULL,
    price_eur      REAL NOT NULL,
    price_date     TEXT NOT NULL,
    market_value_eur REAL NOT NULL,
    country        TEXT,
    PRIMARY KEY (statement_date, isin)
);

CREATE TABLE IF NOT EXISTS targets (
    isin          TEXT PRIMARY KEY,
    target_weight REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    date        TEXT    NOT NULL,
    type        TEXT    NOT NULL,
    direction   TEXT,
    isin        TEXT,
    name        TEXT,
    quantity    REAL,
    amount_eur  REAL    NOT NULL,
    balance_eur REAL    NOT NULL,
    reference   TEXT,
    approx      INTEGER NOT NULL DEFAULT 0,
    UNIQUE (date, amount_eur, balance_eur)
);

CREATE INDEX IF NOT EXISTS idx_tx_isin_dir_date ON transactions(isin, direction, date);
CREATE INDEX IF NOT EXISTS idx_tx_dir_date      ON transactions(direction, date);
CREATE INDEX IF NOT EXISTS idx_tx_date_id       ON transactions(date, id);
"""


def _conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Create tables if they don't exist yet."""
    with _conn() as conn:
        conn.executescript(_DDL)


# ── Holdings ──────────────────────────────────────────────────────────────


def upsert_statement(df: pd.DataFrame) -> None:
    """Insert or replace all holdings rows for the statement dates in df."""
    rows = [
        (
            str(row["statement_date"])[:10],
            str(row["depot"]),
            str(row["name"]),
            str(row["isin"]),
            float(row["shares"]),
            float(row["price_eur"]),
            str(row["price_date"])[:10],
            float(row["market_value_eur"]),
            str(row["country"]) if row["country"] is not None else None,
        )
        for _, row in df.iterrows()
    ]
    with _conn() as conn:
        conn.executemany(
            "INSERT OR REPLACE INTO holdings "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            rows,
        )


def delete_statement(statement_date) -> None:
    """Delete all holdings for a given statement date."""
    date_str = str(statement_date)[:10]
    with _conn() as conn:
        conn.execute(
            "DELETE FROM holdings WHERE statement_date = ?", (date_str,)
        )


def get_statement_dates() -> list[str]:
    """Return sorted list of statement date strings (YYYY-MM-DD)."""
    with _conn() as conn:
        rows = conn.execute(
            "SELECT DISTINCT statement_date FROM holdings "
            "ORDER BY statement_date"
        ).fetchall()
    return [r[0] for r in rows]


def load_all_statements() -> pd.DataFrame:
    """Load every holdings row as a DataFrame with proper dtypes."""
    with _conn() as conn:
        df = pd.read_sql(
            "SELECT * FROM holdings ORDER BY statement_date, name", conn
        )
    if df.empty:
        return df
    df["statement_date"] = pd.to_datetime(df["statement_date"])
    df["price_date"] = pd.to_datetime(df["price_date"])
    return df


# ── Targets ───────────────────────────────────────────────────────────────


def load_targets() -> dict[str, float]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT isin, target_weight FROM targets"
        ).fetchall()
    return {r[0]: r[1] for r in rows}


def save_targets(targets: dict[str, float]) -> None:
    """Replace all target weights atomically."""
    with _conn() as conn:
        conn.execute("DELETE FROM targets")
        conn.executemany(
            "INSERT INTO targets VALUES (?,?)",
            [(isin, weight) for isin, weight in targets.items()],
        )


# ── Transactions ──────────────────────────────────────────────────────────


def upsert_transactions(df: "pd.DataFrame") -> int:
    """Insert transactions, skipping duplicates. Returns number of new rows."""
    rows = [
        (
            str(row["date"])[:10],
            str(row["type"]),
            row.get("direction"),
            row.get("isin"),
            row.get("name"),
            row.get("quantity"),
            float(row["amount_eur"]),
            float(row["balance_eur"]),
            row.get("reference"),
            int(row.get("approx") or 0),
        )
        for _, row in df.iterrows()
    ]
    with _conn() as conn:
        cur = conn.executemany(
            "INSERT OR IGNORE INTO transactions "
            "(date, type, direction, isin, name, quantity, "
            "amount_eur, balance_eur, reference, approx) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            rows,
        )
    return cur.rowcount


def load_transactions() -> "pd.DataFrame":
    """Load all transactions as a DataFrame sorted by date."""
    with _conn() as conn:
        df = pd.read_sql(
            "SELECT * FROM transactions ORDER BY date, id", conn
        )
    if not df.empty:
        df["date"] = pd.to_datetime(df["date"])
    return df


# ── One-time migration ────────────────────────────────────────────────────


def setup() -> None:
    """Initialize DB."""
    init_db()

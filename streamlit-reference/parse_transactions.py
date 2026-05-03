"""
Parse Trade Republic account statement PDFs into structured records.

PDF column layout (x in points):
  DATUM        x < 95   Day, German month abbreviation, or 4-digit year
  TYP          x < 160  Transaction type (Handel, Uberweisung, Ertrag, ...)
  BESCHREIBUNG x < 365  Free-text description (ISIN, name, reference, ...)

Amounts are identified by the position of the euro symbol that follows:
  euro x < 420  -> credit (ZAHLUNGSEINGANG)
  euro x < 480  -> debit  (ZAHLUNGSAUSGANG)
  euro x >= 480 -> balance (SALDO)

Using the euro-anchor avoids misclassifying wide credit amounts whose left
edge falls below the notional column boundary (e.g. "41.786,60" at x=362).

Each transaction spans 2-5 visual rows. A new transaction begins when a
day number (1-31) appears in the DATUM column, and closes on the year.

Usage:
    python parse_transactions.py          # first PDF in transactions/
    python parse_transactions.py <file>
"""

import re
import sys
from pathlib import Path

import pandas as pd
import pdfplumber

_HERE = Path(__file__).parent if "__file__" in dir() else Path.cwd()
TRANSACTIONS_DIR = _HERE / "transactions"

_MONTHS = {
    "Jan.": 1, "Feb.": 2, "März": 3, "Apr.": 4,
    "Mai": 5, "Juni": 6, "Juli": 7, "Aug.": 8,
    "Sept.": 9, "Okt.": 10, "Nov.": 11, "Dez.": 12,
}

# x-column boundaries
_X_TYP = 95    # DATUM ends / TYP starts
_X_DESC = 160  # TYP ends / BESCHREIBUNG starts

# Euro-symbol x-position thresholds
_X_CREDIT_EURO = 420  # euro x < 420 -> credit
_X_DEBIT_EURO = 480   # euro x < 480 -> debit; x >= 480 -> balance

# Patterns
_ISIN_RE = re.compile(r"\b[A-Z]{2}[A-Z0-9]{9}[0-9]\b")
_REF_RE = re.compile(r"\b[A-Z]?\d{10,}\b")   # old-format reference codes
_QTY_RE = re.compile(r"quantity:\s*([\d.]+)")
_NUM_RE = re.compile(r"^[\d.,]+$")


def _parse_num(s: str) -> float:
    return float(s.replace(".", "").replace(",", "."))


# ── Word-level extraction ──────────────────────────────────────────────────

def _extract_words(pdf_path: Path) -> list[dict]:
    """Return all words across all pages with a global y-coordinate.

    x_tolerance=2 keeps a trailing quantity digit (e.g. "4" in
    "quantity: 4") separate from the credit amount that immediately
    follows on the same visual line (e.g. "1.786,60").
    """
    words = []
    with pdfplumber.open(pdf_path) as pdf:
        for page_num, page in enumerate(pdf.pages):
            for w in page.extract_words(x_tolerance=2, y_tolerance=3):
                words.append({
                    "text": w["text"],
                    "x": w["x0"],
                    "y": w["top"] + page_num * 1000,
                    "page": page_num,
                })
    return words


def _group_by_y(words: list[dict], tol: float = 2.0) -> list[tuple[float, list[dict]]]:
    groups: dict[float, list[dict]] = {}
    for w in words:
        key = next((k for k in groups if abs(k - w["y"]) <= tol), w["y"])
        groups.setdefault(key, []).append(w)
    return sorted(groups.items())


def _is_content_row(y_global: float, ws: list[dict]) -> bool:
    y_local = y_global % 1000
    if y_local < 165 or y_local > 720:
        return False
    texts = {w["text"] for w in ws}
    if "DATUM" in texts or "ZAHLUNGSEINGANGZAHLUNGSAUSGANG" in texts:
        return False
    return True


def _is_day(text: str) -> bool:
    try:
        return 1 <= int(text) <= 31
    except ValueError:
        return False


def _is_year(text: str) -> bool:
    try:
        return 2010 <= int(text) <= 2035
    except ValueError:
        return False


# ── Transaction block parser ───────────────────────────────────────────────

def _parse_block(block: list[tuple[float, list[dict]]]) -> dict | None:
    day = month_num = year = None
    type_str = None
    desc_words: list[str] = []
    credit = debit = balance = None

    for _y, ws in block:
        sorted_ws = sorted(ws, key=lambda w: w["x"])

        datum_ws = [w for w in sorted_ws if w["x"] < _X_TYP]
        typ_ws = [w for w in sorted_ws if _X_TYP <= w["x"] < _X_DESC]
        other_ws = [w for w in sorted_ws if w["x"] >= _X_DESC]

        # DATUM column
        for w in datum_ws:
            t = w["text"]
            if _is_day(t) and day is None:
                day = int(t)
            elif _is_year(t) and year is None:
                year = int(t)
            elif t in _MONTHS and month_num is None:
                month_num = _MONTHS[t]

        # TYP column
        if typ_ws and type_str is None:
            type_str = " ".join(w["text"] for w in typ_ws)

        # Amount extraction using "€" anchor position
        # Mark indices (into other_ws) that are amounts or their "€" signs
        amount_idx: set[int] = set()
        for i, w in enumerate(other_ws):
            if w["text"] != "€":
                continue
            x_euro = w["x"]
            # Find the immediately preceding number word
            if i > 0 and _NUM_RE.match(other_ws[i - 1]["text"]):
                val = _parse_num(other_ws[i - 1]["text"])
                amount_idx.update([i - 1, i])
                if x_euro < _X_CREDIT_EURO:
                    if credit is None:
                        credit = val
                elif x_euro < _X_DEBIT_EURO:
                    if debit is None:
                        debit = val
                else:
                    if balance is None:
                        balance = val

        # BESCHREIBUNG: everything not consumed as an amount
        row_desc = " ".join(
            w["text"] for j, w in enumerate(other_ws) if j not in amount_idx
        )
        if row_desc.strip():
            desc_words.append(row_desc.strip())

    if not all([day, month_num, year, type_str, balance is not None]):
        return None

    date_str = f"{year:04d}-{month_num:02d}-{day:02d}"
    full_desc = " ".join(desc_words)
    t_lower = type_str.lower()

    # Determine direction and extract fields
    isin = reference = name = None
    quantity: float | None = None
    direction: str | None = None
    amount = 0.0

    isin_m = _ISIN_RE.search(full_desc)
    if isin_m:
        isin = isin_m.group(0)

    if "handel" in t_lower:
        qty_m = _QTY_RE.search(full_desc)
        if qty_m:
            quantity = float(qty_m.group(1))

        dl = full_desc.lower()
        is_buy = (
            "buy trade" in dl or "direktkauf" in dl or "savings plan" in dl
        )
        is_sell = "sell trade" in dl or "direktverkauf" in dl

        # Crypto / fallback: infer from which amount column was populated
        if not is_buy and not is_sell:
            is_buy = debit is not None
            is_sell = credit is not None

        if is_buy:
            direction = "buy"
            amount = -(debit or 0.0)
        else:
            direction = "sell"
            amount = credit or 0.0

        if isin:
            after = full_desc[full_desc.index(isin) + len(isin):].strip()
            qty_pos = after.lower().find("quantity:")
            if qty_pos >= 0:
                # New format or savings plan: name precedes "quantity:"
                name = after[:qty_pos].strip().rstrip(",").strip() or None
            else:
                # Old format: name precedes the reference code, optional "KW" suffix
                after = re.sub(r"\s+KW$", "", after).strip()
                ref_m = _REF_RE.search(after)
                if ref_m:
                    reference = ref_m.group(0)
                    name = after[: ref_m.start()].strip() or None
                else:
                    name = after.strip() or None

    elif "überweisung" in t_lower:
        dl = full_desc.lower()
        if any(k in dl for k in ("payin", "einzahlung", "incoming")):
            direction = "deposit"
            amount = credit or 0.0
        else:
            direction = "withdrawal"
            amount = -(debit or 0.0)
        name = full_desc.strip() or None

    elif "ertrag" in t_lower:
        direction = "dividend"
        amount = credit or 0.0
        if isin and "ereignis" in full_desc.lower():
            after = full_desc[full_desc.index(isin) + len(isin):].strip()
            ref_m = _REF_RE.search(after)
            if ref_m:
                reference = ref_m.group(0)
                name = after[: ref_m.start()].strip() or None

    elif "zinsen" in t_lower:
        direction = "interest"
        amount = credit or 0.0

    elif "bonus" in t_lower:
        direction = "saveback"
        amount = credit or 0.0

    elif "kartentransaktion" in t_lower:
        if credit is not None:
            direction = "card_refund"
            amount = credit
        else:
            direction = "card"
            amount = -(debit or 0.0)
        # Merchant name may be fused into the type word or in description
        suffix = type_str[len("Kartentransaktion"):].strip()
        name = (suffix + " " + full_desc).strip() or None

    return {
        "date": date_str,
        "type": type_str,
        "direction": direction,
        "isin": isin,
        "name": name or None,
        "quantity": quantity,
        "amount_eur": round(amount, 2),
        "balance_eur": balance,
        "reference": reference,
    }


# ── Public API ─────────────────────────────────────────────────────────────

def parse_account_statement(pdf_path: Path) -> pd.DataFrame:
    """Parse a Trade Republic account statement PDF into a DataFrame."""
    words = _extract_words(pdf_path)
    rows = _group_by_y(words)
    rows = [(y, ws) for y, ws in rows if _is_content_row(y, ws)]

    blocks: list[list] = []
    current: list = []

    for y, ws in rows:
        datum_texts = [w["text"] for w in ws if w["x"] < _X_TYP]
        has_day = any(_is_day(t) for t in datum_texts)
        has_year = any(_is_year(t) for t in datum_texts)

        if has_day:
            if current:
                blocks.append(current)
            current = [(y, ws)]
        elif has_year and current:
            current.append((y, ws))
            blocks.append(current)
            current = []
        elif current:
            current.append((y, ws))

    if current:
        blocks.append(current)

    records = [r for b in blocks if (r := _parse_block(b)) is not None]
    df = pd.DataFrame(records)
    if df.empty:
        return df
    df["date"] = pd.to_datetime(df["date"])
    return df


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    pdf_path = Path(args[0]) if args else next(TRANSACTIONS_DIR.glob("*.pdf"))
    print(f"Parsing: {pdf_path.name}")

    df = parse_account_statement(pdf_path)
    print(f"Parsed {len(df)} transactions")

    credits = df[df["amount_eur"] > 0]["amount_eur"].sum()
    debits = df[df["amount_eur"] < 0]["amount_eur"].sum()
    print("\nDirection breakdown:")
    print(df.groupby("direction").agg(
        count=("date", "count"), total=("amount_eur", "sum")
    ).to_string())
    print(f"\nCredits : {credits:,.2f}")
    print(f"Debits  : {debits:,.2f}")
    print(f"Net     : {credits + debits:,.2f}")

    import db
    db.setup()
    # Re-import: clear existing transactions and reload
    with db._conn() as conn:
        conn.execute("DELETE FROM transactions")
    inserted = db.upsert_transactions(df)
    print(f"\nSaved {inserted} rows to {db.DB_PATH}")


if __name__ == "__main__":
    main()

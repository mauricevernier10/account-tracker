"""
Parse Trade Republic Depotauszug PDFs into a DataFrame.

Usage:
    python parse_depot.py                     # parse latest PDF in raw data/
    python parse_depot.py "path/to/file.pdf"  # parse specific file

Output: prints DataFrame and saves to output/depot_<date>.csv
"""

import re
import sys
from pathlib import Path

import pandas as pd
import pdfplumber

_HERE = Path(__file__).parent if "__file__" in dir() else Path.cwd()
RAW_DATA_DIR = _HERE / "raw data"
OUTPUT_DIR = _HERE / "output"


def find_latest_pdf(directory: Path) -> Path:
    pdfs = sorted(directory.glob("*.pdf"))
    if not pdfs:
        raise FileNotFoundError(f"No PDFs found in {directory}")
    return pdfs[-1]  # alphabetical sort — YYYY-MM prefix keeps them in order


def parse_german_number(s: str) -> float:
    """Convert German-formatted number (1.234,56) to float."""
    return float(s.replace(".", "").replace(",", "."))


def extract_text(pdf_path: Path) -> str:
    with pdfplumber.open(pdf_path) as pdf:
        return "\n".join(page.extract_text() or "" for page in pdf.pages)


def parse_metadata(text: str) -> dict:
    date_match = re.search(r"zum\s+(\d{2}\.\d{2}\.\d{4})", text)
    depot_match = re.search(r"DEPOT\s+(\d+)", text)
    return {
        "statement_date": date_match.group(1) if date_match else None,
        "depot": depot_match.group(1) if depot_match else None,
    }


def parse_holdings(text: str) -> list[dict]:
    """
    Each holding block looks like:
        {shares} Stk. {name}  {price}  {market_value}
        {share_type}          {date}
        ISIN: {isin}
        [optional extra line]
        Lagerland: {country}
    """
    # Isolate the positions section
    positions_match = re.search(
        r"STK\. / NOMINALE.*?KURSWERT IN EUR\n(.*?)ANZAHL POSITIONEN",
        text,
        re.DOTALL,
    )
    if not positions_match:
        raise ValueError("Could not find POSITIONEN section in PDF")

    block = positions_match.group(1)
    lines = block.strip().splitlines()

    holdings = []
    i = 0
    # Regex for the first line of a holding
    holding_start = re.compile(
        r"^([\d,]+)\s+Stk\.\s+(.+?)\s+([\d.,]+)\s+([\d.,]+)$"
    )

    while i < len(lines):
        m = holding_start.match(lines[i].strip())
        if not m:
            i += 1
            continue

        shares_str, name, price_str, value_str = m.groups()

        # Collect subsequent lines until next holding or end
        isin = country = price_date = None
        i += 1
        while i < len(lines):
            line = lines[i].strip()
            if holding_start.match(line):
                break
            if line.startswith("ISIN:"):
                isin = line.replace("ISIN:", "").strip()
            elif line.startswith("Lagerland:"):
                country = line.replace("Lagerland:", "").strip()
            date_in_line = re.search(r"\b(\d{2}\.\d{2}\.\d{4})$", line)
            if date_in_line:
                price_date = date_in_line.group(1)
            i += 1

        holdings.append(
            {
                "name": name.strip(),
                "isin": isin,
                "shares": parse_german_number(shares_str),
                "price_eur": parse_german_number(price_str),
                "price_date": price_date,
                "market_value_eur": parse_german_number(value_str),
                "country": country,
            }
        )

    return holdings


def parse_pdf(pdf_path: Path) -> pd.DataFrame:
    text = extract_text(pdf_path)
    meta = parse_metadata(text)
    if not meta["statement_date"]:
        raise ValueError(f"Could not find statement date (DATUM) in {pdf_path.name}")
    if not meta["depot"]:
        raise ValueError(f"Could not find depot number (DEPOT) in {pdf_path.name}")
    holdings = parse_holdings(text)

    df = pd.DataFrame(holdings)
    df.insert(0, "statement_date", meta["statement_date"])
    df.insert(1, "depot", meta["depot"])

    # Convert date strings to proper dates
    df["statement_date"] = pd.to_datetime(
        df["statement_date"], format="%d.%m.%Y"
    ).dt.date
    df["price_date"] = pd.to_datetime(
        df["price_date"], format="%d.%m.%Y"
    ).dt.date

    return df


def main():
    import db

    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    pdf_path = Path(args[0]) if args else find_latest_pdf(RAW_DATA_DIR)
    print(f"Parsing: {pdf_path.name}")

    df = parse_pdf(pdf_path)

    db.setup()
    db.upsert_statement(df)

    print(df.to_string(index=False))
    print(f"\nTotal market value: EUR {df['market_value_eur'].sum():,.2f}")
    print(f"Saved to: {db.DB_PATH}")

    return df


if __name__ == "__main__":
    main()

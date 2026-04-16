"""
Data loading, caching, and computation functions for the Trade Republic Portfolio Dashboard.
"""

from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field

import pandas as pd
import streamlit as st
import yfinance as yf

import db
from constants import _MAJOR_EXCHANGES
from parse_depot import RAW_DATA_DIR, parse_pdf

_TICKER_CACHE_PATH = RAW_DATA_DIR.parent / "ticker_cache.json"


def _load_ticker_disk_cache() -> dict[str, str]:
    try:
        return json.loads(_TICKER_CACHE_PATH.read_text())
    except Exception:
        return {}


def _save_ticker_disk_cache(cache: dict[str, str]) -> None:
    try:
        _TICKER_CACHE_PATH.write_text(json.dumps(cache, indent=2))
    except Exception:
        pass


def _resolve_one_isin(isin: str) -> tuple[str, str]:
    """Resolve a single ISIN to its ticker symbol. Returns (isin, symbol)."""
    try:
        info = yf.Ticker(isin).info
        symbol = info.get("symbol") or isin
        exchange = info.get("exchange", "")
        if exchange not in _MAJOR_EXCHANGES:
            short_name = info.get("shortName", "")
            if short_name:
                quotes = yf.Search(short_name, max_results=5).quotes
                primary = next(
                    (q for q in quotes if q.get("exchange") in _MAJOR_EXCHANGES),
                    None,
                )
                if primary:
                    symbol = primary["symbol"]
        return isin, symbol.split(".")[0]  # strip exchange suffix
    except Exception:
        return isin, isin


# ── PDF parsing ───────────────────────────────────────────────────────────────

def _parse_new_pdfs() -> tuple[list[str], bool]:
    """Parse any PDFs not yet in the DB. Returns (warnings, changed)."""
    warnings_out: list[str] = []
    changed = False
    existing_dates = set(db.get_statement_dates())

    for pdf in sorted(RAW_DATA_DIR.glob("*.pdf")):
        try:
            df = parse_pdf(pdf)
        except Exception as e:
            warnings_out.append(f"Could not parse {pdf.name}: {e}")
            continue
        date_str = str(df["statement_date"].iloc[0])[:10]
        if date_str not in existing_dates:
            db.upsert_statement(df)
            changed = True

    return warnings_out, changed


# ── Cached DB loaders ─────────────────────────────────────────────────────────

@st.cache_data
def load_all_statements() -> pd.DataFrame:
    return db.load_all_statements()


@st.cache_data
def load_transactions() -> pd.DataFrame:
    return db.load_transactions()


# ── Cached yfinance loaders ───────────────────────────────────────────────────

@st.cache_data(ttl=60 * 60 * 24)
def fetch_tickers(isins: tuple[str, ...]) -> dict[str, str]:
    """Resolve ISINs to tickers via yfinance.

    Results are persisted to disk so restarts skip the network round-trip for
    already-known ISINs. Unknown ISINs are fetched in parallel.
    """
    disk = _load_ticker_disk_cache()
    missing = [i for i in isins if i not in disk]

    if missing:
        with ThreadPoolExecutor(max_workers=8) as pool:
            futures = {pool.submit(_resolve_one_isin, isin): isin for isin in missing}
            for future in as_completed(futures):
                isin, symbol = future.result()
                disk[isin] = symbol
        _save_ticker_disk_cache(disk)

    return {isin: disk[isin] for isin in isins}


BENCHMARKS = {
    "S&P 500": {"ticker": "^GSPC", "col": "index_eur", "label": "S&P 500 (EUR)"},
    "MSCI World": {"ticker": "URTH", "col": "index_eur", "label": "MSCI World (EUR)"},
    "NASDAQ 100": {"ticker": "^NDX", "col": "index_eur", "label": "NASDAQ 100 (EUR)"},
}


@st.cache_data(ttl=60 * 60 * 24)
def fetch_index_eur(ticker: str, start: str, end: str) -> pd.DataFrame:
    """Fetch any USD-quoted index/ETF in EUR terms plus the EURUSD rate."""
    idx = yf.download(ticker, start=start, end=end, auto_adjust=True, progress=False)
    fx = yf.download("EURUSD=X", start=start, end=end, auto_adjust=True, progress=False)
    idx_close = idx["Close"].squeeze()
    fx_close = fx["Close"].squeeze()
    df = pd.DataFrame({"index_usd": idx_close, "eurusd": fx_close}).dropna()
    df.index = df.index.tz_localize(None)
    df["index_eur"] = df["index_usd"] / df["eurusd"]
    return df[["index_eur", "eurusd"]]


def fetch_sp500_eur(start: str, end: str) -> pd.DataFrame:
    """Backward-compat wrapper — returns S&P 500 data with legacy column names."""
    df = fetch_index_eur("^GSPC", start, end)
    return df.rename(columns={"index_eur": "sp500_eur"})[["sp500_eur", "eurusd"]]


# ── Performance metrics: CAGR, XIRR (IRR), TWR ───────────────────────────────

def _xirr(cashflows: list[tuple[pd.Timestamp, float]]) -> float | None:
    """Newton-Raphson XIRR.  cashflows = [(date, amount), ...]
    Negative amount = outflow (money invested), positive = inflow (money received).
    Returns annualised rate as a decimal, or None if no solution found.
    """
    if len(cashflows) < 2:
        return None
    dates, amounts = zip(*cashflows)
    amounts = list(amounts)
    if not any(a > 0 for a in amounts) or not any(a < 0 for a in amounts):
        return None
    t0 = min(dates)
    t = [(d - t0).days / 365.25 for d in dates]

    def npv(r):
        return sum(a / (1 + r) ** ti for a, ti in zip(amounts, t))

    def dnpv(r):
        return sum(-ti * a / (1 + r) ** (ti + 1) for a, ti in zip(amounts, t))

    r = 0.1
    for _ in range(200):
        f = npv(r)
        df_dr = dnpv(r)
        if abs(df_dr) < 1e-14:
            break
        step = f / df_dr
        r -= step
        if r <= -1.0:
            r = -0.9
        if abs(step) < 1e-9:
            break
    return r if -0.9999 < r < 100 else None


def compute_performance_metrics(
    all_dates: list,
    df_all: pd.DataFrame,
    tx_all: pd.DataFrame,
    selected_date,
) -> dict[str, float | None]:
    """Compute Total Price Return, IRR (XIRR), and annualised TWR up to selected_date.

    Cash-flow convention for IRR:
      buy  → amount_eur < 0  (already negative in the data)
      sell, dividend, interest → amount_eur > 0
      terminal value (portfolio value at selected_date) → positive inflow
    """
    dates_up_to = [d for d in all_dates if d <= selected_date]
    if len(dates_up_to) < 2:
        return {"price_return": None, "irr": None, "twr": None}

    first_date = dates_up_to[0]
    years = (selected_date - first_date).days / 365.25
    if years <= 0:
        return {"price_return": None, "irr": None, "twr": None}

    # Portfolio value at each statement date
    pv: dict = {
        d: df_all[df_all["statement_date"] == d]["market_value_eur"].sum()
        for d in dates_up_to
    }
    last_value = pv[selected_date]

    # ── Total Price Return ────────────────────────────────────────────────────
    # price_effect / net_invested_cumulative (not annualised — timing-independent)
    tx_up_to = tx_all[tx_all["date"] <= pd.Timestamp(selected_date)]
    net_invested = (
        tx_up_to[tx_up_to["direction"] == "buy"]["amount_eur"].abs().sum()
        - tx_up_to[tx_up_to["direction"] == "sell"]["amount_eur"].sum()
    )
    price_return = (last_value - net_invested) / net_invested if net_invested > 0 else None

    # ── XIRR (IRR) ────────────────────────────────────────────────────────────
    # Seed with the initial portfolio value as a notional "purchase" at t0
    first_value = pv[first_date]
    cf: list[tuple] = [(pd.Timestamp(first_date), -first_value)]
    tx_slice = tx_all[
        (tx_all["date"] > pd.Timestamp(first_date))
        & (tx_all["date"] <= pd.Timestamp(selected_date))
        & (tx_all["direction"].isin(["buy", "sell", "dividend", "interest"]))
    ]
    for _, row in tx_slice.iterrows():
        cf.append((row["date"], row["amount_eur"]))
    # Terminal: current portfolio value as positive inflow (notional liquidation)
    cf.append((pd.Timestamp(selected_date), last_value))
    irr = _xirr(cf)

    # ── TWR ──────────────────────────────────────────────────────────────────
    twr_product = 1.0
    for i in range(1, len(dates_up_to)):
        d_prev = dates_up_to[i - 1]
        d_curr = dates_up_to[i]
        v_start = pv[d_prev]
        v_end = pv[d_curr]
        tx_p = tx_all[
            (tx_all["date"] > pd.Timestamp(d_prev))
            & (tx_all["date"] <= pd.Timestamp(d_curr))
        ]
        net_flow = (
            tx_p[tx_p["direction"] == "buy"]["amount_eur"].abs().sum()
            - tx_p[tx_p["direction"] == "sell"]["amount_eur"].sum()
        )
        denom = v_start + net_flow
        if denom > 0:
            twr_product *= v_end / denom
    twr = twr_product ** (1 / years) - 1

    return {"price_return": price_return, "irr": irr, "twr": twr}


@st.cache_data
def compute_performance_series(
    all_dates: tuple,
    df_all: pd.DataFrame,
    tx_all: pd.DataFrame,
) -> pd.DataFrame:
    """IRR and TWR for every statement date (cumulative from inception).
    First date always yields None (no prior period to measure from).
    """
    dates_list = list(all_dates)
    rows = []
    for d in dates_list:
        p = compute_performance_metrics(dates_list, df_all, tx_all, d)
        rows.append({"date": d, "irr": p["irr"], "twr": p["twr"]})
    return pd.DataFrame(rows)


# ── Cached DataFrame computations ────────────────────────────────────────────

@st.cache_data
def compute_totals(df: pd.DataFrame) -> pd.DataFrame:
    t = (
        df.groupby("statement_date")
        .agg(
            total_value=("market_value_eur", "sum"),
            positions=("name", "count"),
        )
        .reset_index()
    )
    t["avg_size"] = t["total_value"] / t["positions"]
    return t


@st.cache_data
def compute_pivot(df: pd.DataFrame) -> pd.DataFrame:
    piv = df.pivot_table(
        index="statement_date", columns="name", values="market_value_eur", aggfunc="sum"
    )
    return piv[piv.iloc[-1].sort_values(ascending=False).index]


# ── Overview table computation ────────────────────────────────────────────────

def _period_flows(tx_p: pd.DataFrame, holdings_tickers: dict) -> dict:
    """Extract per-direction totals and per-ISIN breakdowns for one period."""
    def _by_dir(direction):
        return tx_p[tx_p["direction"] == direction]

    divs_p = round(_by_dir("dividend")["amount_eur"].sum(), 2)
    int_p = round(_by_dir("interest")["amount_eur"].sum(), 2)
    buy_p = round(_by_dir("buy")["amount_eur"].abs().sum(), 0)
    sell_p = round(_by_dir("sell")["amount_eur"].sum(), 0)
    dep_p = round(_by_dir("deposit")["amount_eur"].sum(), 0)
    with_p = round(_by_dir("withdrawal")["amount_eur"].abs().sum(), 0)

    def _isin_bkd(direction, transform=None):
        s = _by_dir(direction).groupby("isin")["amount_eur"].sum()
        return {
            holdings_tickers.get(i, i): round(transform(v) if transform else v, 2 if direction == "dividend" else 0)
            for i, v in s.items()
        }

    breakdowns = {
        "Dividends": _isin_bkd("dividend"),
        "  Invested": _isin_bkd("buy", abs),
        "  Proceeds": {k: -v for k, v in _isin_bkd("sell").items()},
    }
    return dict(
        divs_p=divs_p, int_p=int_p, buy_p=buy_p, sell_p=sell_p,
        dep_p=dep_p, with_p=with_p, breakdowns=breakdowns,
    )


def _price_effect_breakdown(
    curr_h: pd.DataFrame,
    prev_h: pd.DataFrame,
    tx_p: pd.DataFrame,
    holdings_tickers: dict,
) -> tuple[float, dict]:
    """Compute price effect total and per-position breakdown for one period."""
    b_isin = (
        tx_p[tx_p["direction"] == "buy"]
        .groupby("isin")["amount_eur"]
        .apply(lambda x: x.abs().sum())
    )
    s_isin = tx_p[tx_p["direction"] == "sell"].groupby("isin")["amount_eur"].sum()

    investments = curr_h["market_value_eur"].sum()
    investments_prev = prev_h["market_value_eur"].sum()
    buy_p = b_isin.sum()
    sell_p = s_isin.sum()
    price_eff = round(investments - investments_prev - buy_p + sell_p, 0)

    pe_bkd = {}
    for isin in curr_h.index.union(prev_h.index):
        vc = curr_h.at[isin, "market_value_eur"] if isin in curr_h.index else 0.0
        vp = prev_h.at[isin, "market_value_eur"] if isin in prev_h.index else 0.0
        pe_v = round(vc - vp - b_isin.get(isin, 0.0) + s_isin.get(isin, 0.0), 0)
        if pe_v != 0:
            pe_bkd[holdings_tickers.get(isin, isin)] = pe_v

    return price_eff, pe_bkd


@st.cache_data
def compute_ov_data(ov_dates, df_all, ov_tx, all_dates, holdings_tickers):
    """Compute Overview totals and per-contributor breakdowns. Cached."""
    date_idx = {d: i for i, d in enumerate(all_dates)}
    _EXPANDABLE = {"  Price Effect", "Dividends", "  Invested", "  Proceeds"}
    _ROW_ORDER = [
        "Portfolio", "  Port. Start", "  Invested", "  Proceeds",
        "  Price Effect", "  Port. End", "Cash", "  Cash Start",
        "  C. Invested", "  C. Proceeds", "Dividends", "Interest",
        "  Deposits", "  Withdrawals", "  Cash End", "Total End Balance",
    ]
    tbl: dict[str, dict] = {r: {} for r in _ROW_ORDER}
    bkd: dict[str, dict[str, dict]] = {r: {} for r in _EXPANDABLE}

    for d_curr in ov_dates:
        idx = date_idx[d_curr]
        d_prev = all_dates[idx - 1] if idx > 0 else None
        d_curr_t = pd.Timestamp(d_curr)
        d_prev_t = pd.Timestamp(d_prev) if d_prev else pd.Timestamp("1900-01-01")
        col = pd.Timestamp(d_curr).strftime("%b '%y")

        curr_h = df_all[df_all["statement_date"] == d_curr].set_index("isin")[["market_value_eur"]]
        investments = curr_h["market_value_eur"].sum()

        prev_h = None
        investments_prev = None
        if d_prev is not None:
            prev_h = df_all[df_all["statement_date"] == d_prev].set_index("isin")[["market_value_eur"]]
            investments_prev = prev_h["market_value_eur"].sum()

        tx_prev_at = ov_tx[ov_tx["date"] <= d_prev_t]
        cash_prev = round(tx_prev_at["balance_eur"].iloc[-1], 0) if not tx_prev_at.empty else None

        if d_prev is None:
            divs_p = int_p = buy_p = sell_p = dep_p = with_p = price_eff = None
        else:
            tx_p = ov_tx[(ov_tx["date"] > d_prev_t) & (ov_tx["date"] <= d_curr_t)]
            flows = _period_flows(tx_p, holdings_tickers)
            divs_p = flows["divs_p"]
            int_p = flows["int_p"]
            buy_p = flows["buy_p"]
            sell_p = flows["sell_p"]
            dep_p = flows["dep_p"]
            with_p = flows["with_p"]
            for key, val in flows["breakdowns"].items():
                bkd[key][col] = val
            price_eff, pe_bkd = _price_effect_breakdown(curr_h, prev_h, tx_p, holdings_tickers)
            bkd["  Price Effect"][col] = pe_bkd

        tx_at = ov_tx[ov_tx["date"] <= d_curr_t]
        cash = round(tx_at["balance_eur"].iloc[-1], 0) if not tx_at.empty else 0.0

        tbl["Portfolio"][col] = round(investments, 0)
        tbl["  Port. Start"][col] = round(investments_prev, 0) if investments_prev is not None else None
        tbl["  Invested"][col] = buy_p
        tbl["  Proceeds"][col] = -sell_p if sell_p is not None else None
        tbl["  Price Effect"][col] = price_eff
        tbl["  Port. End"][col] = round(investments, 0)
        tbl["Cash"][col] = cash
        tbl["  Cash Start"][col] = cash_prev
        tbl["  C. Invested"][col] = -buy_p if buy_p is not None else None
        tbl["  C. Proceeds"][col] = sell_p
        tbl["Dividends"][col] = divs_p
        tbl["Interest"][col] = int_p
        tbl["  Deposits"][col] = dep_p
        tbl["  Withdrawals"][col] = -with_p if with_p is not None else None
        tbl["  Cash End"][col] = cash
        tbl["Total End Balance"][col] = round(investments + cash, 0)

    top_map: dict[str, list[str]] = {}
    for er in _EXPANDABLE:
        agg: dict[str, float] = {}
        for col_vals in bkd[er].values():
            for k, v in col_vals.items():
                agg[k] = agg.get(k, 0) + abs(v)
        top_map[er] = [k for k, _ in sorted(agg.items(), key=lambda x: x[1], reverse=True)]

    return tbl, bkd, top_map


def compute_benchmark(
    df_totals: pd.DataFrame,
    tx_all: pd.DataFrame,
    bm_raw: pd.DataFrame,
    price_col: str = "index_eur",
) -> list | None:
    """Simulate a benchmark replicating the portfolio's cash flows.

    Works with any DataFrame that has a price column (default ``index_eur``).
    Returns a list of EUR values aligned with df_totals rows, or None on failure.
    """
    # Support legacy callers that pass sp_raw with "sp500_eur" column
    if price_col not in bm_raw.columns and "sp500_eur" in bm_raw.columns:
        price_col = "sp500_eur"

    try:
        first_d = pd.Timestamp(df_totals["statement_date"].iloc[0])
        init_px = bm_raw[price_col].asof(first_d)
        if not (pd.notna(init_px) and init_px > 0):
            return None

        bm_shares = df_totals["total_value"].iloc[0] / init_px
        eq_tx = (
            tx_all[tx_all["direction"].isin(["buy", "sell"]) & (tx_all["date"] > first_d)]
            .sort_values("date")
            .reset_index(drop=True)
        )
        tx_idx = 0
        values = []
        for i, d in enumerate(df_totals["statement_date"]):
            d_ts = pd.Timestamp(d)
            if i > 0:
                while tx_idx < len(eq_tx):
                    tx_r = eq_tx.iloc[tx_idx]
                    if tx_r["date"] > d_ts:
                        break
                    px = bm_raw[price_col].asof(tx_r["date"])
                    if pd.notna(px) and px > 0:
                        # buy: amount_eur < 0 → -amount/px > 0 (buy shares)
                        # sell: amount_eur > 0 → -amount/px < 0 (sell shares)
                        bm_shares += -tx_r["amount_eur"] / px
                    tx_idx += 1
            val_px = bm_raw[price_col].asof(d_ts)
            values.append(round(bm_shares * val_px, 2) if pd.notna(val_px) else None)
        return values
    except Exception:
        return None


# ── FIFO lot matching & holding-period utilities ─────────────────────────────

@dataclass
class FifoLot:
    """One buy lot with FIFO sell-matching bookkeeping."""
    idx: int                     # original tx DataFrame index
    isin: str
    buy_date: pd.Timestamp
    buy_price: float
    qty_total: float
    qty_remaining: float
    qty_sold: float = 0.0
    sold_proceeds: float = 0.0
    sell_segments: list = field(default_factory=list)  # [{"date": ts, "qty": float}]


def compute_fifo_lots(
    tx: pd.DataFrame,
    curr_prices: dict[str, float] | None = None,
) -> list[FifoLot]:
    """FIFO-match buy lots against sells, returning enriched lot objects.

    Parameters
    ----------
    tx : DataFrame with columns date, direction, isin, quantity, amount_eur
    curr_prices : {isin: current_price_per_share} for held positions

    Returns list of FifoLot with sell_segments tracking which sells consumed
    each lot (needed for holding-period calculation).
    """
    curr_prices = curr_prices or {}
    lots: list[FifoLot] = []

    for isin in tx["isin"].dropna().unique():
        isin_tx = tx[tx["isin"] == isin].sort_values("date")
        buys = isin_tx[
            (isin_tx["direction"] == "buy")
            & isin_tx["quantity"].notna()
            & (isin_tx["quantity"].abs() > 0)
        ]
        sells = isin_tx[
            (isin_tx["direction"] == "sell")
            & isin_tx["quantity"].notna()
            & (isin_tx["quantity"].abs() > 0)
        ]

        isin_lots: list[FifoLot] = []
        for bidx, br in buys.iterrows():
            bqty = abs(br["quantity"])
            bpx = abs(br["amount_eur"]) / bqty
            isin_lots.append(FifoLot(
                idx=bidx, isin=isin,
                buy_date=pd.Timestamp(br["date"]),
                buy_price=bpx, qty_total=bqty, qty_remaining=bqty,
            ))

        for _, sr in sells.iterrows():
            sqty = abs(sr["quantity"])
            spx = abs(sr["amount_eur"]) / sqty
            sell_date = pd.Timestamp(sr["date"])
            remaining = sqty
            for lot in isin_lots:
                if remaining <= 0:
                    break
                if lot.qty_remaining <= 0:
                    continue
                consumed = min(lot.qty_remaining, remaining)
                lot.qty_remaining -= consumed
                lot.qty_sold += consumed
                lot.sold_proceeds += consumed * spx
                lot.sell_segments.append({"date": sell_date, "qty": consumed})
                remaining -= consumed

        lots.extend(isin_lots)

    return lots


def compute_realized_gains(tx_all: pd.DataFrame) -> pd.DataFrame:
    """Per-sell realized gain/loss using FIFO cost basis.

    Processes the full transaction history so that pre-2025 buys are
    correctly matched against later sells.  Returns one row per sell.

    Columns: date, isin, name, quantity, proceeds, cost_basis, gain_loss
    """
    from collections import deque

    results = []
    inv_tx = tx_all[
        tx_all["direction"].isin(["buy", "sell"])
        & tx_all["quantity"].notna()
        & (tx_all["quantity"].abs() > 0)
    ]
    for isin in inv_tx["isin"].dropna().unique():
        isin_tx = inv_tx[inv_tx["isin"] == isin].sort_values("date")
        buy_q: deque = deque()   # [remaining_qty, cost_per_share]
        for _, row in isin_tx.iterrows():
            if row["direction"] == "buy":
                qty = abs(row["quantity"])
                buy_q.append([qty, abs(row["amount_eur"]) / qty])
            else:
                qty_sold = abs(row["quantity"])
                proceeds = float(row["amount_eur"])
                cost_basis = 0.0
                rem = qty_sold
                while rem > 1e-9 and buy_q:
                    lot = buy_q[0]
                    take = min(lot[0], rem)
                    cost_basis += take * lot[1]
                    lot[0] -= take
                    rem -= take
                    if lot[0] < 1e-9:
                        buy_q.popleft()
                results.append({
                    "date": row["date"],
                    "isin": isin,
                    "name": row.get("name") or isin,
                    "quantity": qty_sold,
                    "proceeds": round(proceeds, 2),
                    "cost_basis": round(cost_basis, 2),
                    "gain_loss": round(proceeds - cost_basis, 2),
                })

    if not results:
        return pd.DataFrame(
            columns=["date", "isin", "name", "quantity",
                     "proceeds", "cost_basis", "gain_loss"]
        )
    return pd.DataFrame(results).sort_values("date").reset_index(drop=True)


def fifo_lot_perf(lot: FifoLot, curr_prices: dict[str, float]) -> tuple[float | None, float | None, float | None]:
    """Derive (fifo_perf_%, fifo_pnl_€, weighted_sell_price) for a single lot."""
    cost = lot.qty_total * lot.buy_price
    if cost <= 0:
        return None, None, None

    sell_px = (lot.sold_proceeds / lot.qty_sold) if lot.qty_sold > 0 else None
    curr = curr_prices.get(lot.isin)

    if lot.qty_remaining > 0 and curr is None:
        # Position fully exited, residual from qty approximation
        if lot.qty_sold > 0:
            realized_cost = lot.qty_sold * lot.buy_price
            perf = (lot.sold_proceeds / realized_cost - 1) * 100
            pnl = lot.sold_proceeds - realized_cost
        else:
            perf, pnl = None, None
    else:
        held_val = lot.qty_remaining * curr if curr else 0.0
        perf = ((lot.sold_proceeds + held_val) / cost - 1) * 100
        pnl = (lot.sold_proceeds + held_val) - cost

    return perf, pnl, sell_px


@dataclass
class HoldingPeriods:
    per_isin: dict[str, float]       # isin → avg holding days
    portfolio_avg_days: float        # EUR-weighted portfolio average


def compute_holding_periods(
    lots: list[FifoLot],
    today: pd.Timestamp | None = None,
) -> HoldingPeriods:
    """Quantity-weighted average holding period per ISIN + portfolio-level.

    Sold shares: holding period = sell_date − buy_date
    Held shares: holding period = today − buy_date
    Portfolio-level: weighted by EUR invested per ISIN.
    """
    today = today or pd.Timestamp.today()

    # Per-ISIN accumulators
    isin_weighted_days: dict[str, float] = {}
    isin_total_qty: dict[str, float] = {}
    isin_total_cost: dict[str, float] = {}

    for lot in lots:
        isin = lot.isin
        isin_weighted_days.setdefault(isin, 0.0)
        isin_total_qty.setdefault(isin, 0.0)
        isin_total_cost.setdefault(isin, 0.0)

        # Sold segments
        for seg in lot.sell_segments:
            days = (seg["date"] - lot.buy_date).days
            isin_weighted_days[isin] += seg["qty"] * max(days, 0)
            isin_total_qty[isin] += seg["qty"]

        # Remaining (still held)
        if lot.qty_remaining > 0:
            days = (today - lot.buy_date).days
            isin_weighted_days[isin] += lot.qty_remaining * max(days, 0)
            isin_total_qty[isin] += lot.qty_remaining

        isin_total_cost[isin] += lot.qty_total * lot.buy_price

    per_isin: dict[str, float] = {}
    port_weighted = 0.0
    port_total_cost = 0.0
    for isin in isin_weighted_days:
        if isin_total_qty[isin] > 0:
            per_isin[isin] = isin_weighted_days[isin] / isin_total_qty[isin]
        else:
            per_isin[isin] = 0.0
        cost = isin_total_cost.get(isin, 0.0)
        port_weighted += per_isin[isin] * cost
        port_total_cost += cost

    portfolio_avg = port_weighted / port_total_cost if port_total_cost > 0 else 0.0
    return HoldingPeriods(per_isin=per_isin, portfolio_avg_days=portfolio_avg)


@st.cache_data
def compute_holding_period_series(
    df_all: pd.DataFrame,
    tx_all: pd.DataFrame,
    all_dates: tuple,
) -> tuple:
    """Compute portfolio + per-company holding periods at each statement date.

    Returns (hold_months: list[float], hold_per_co: dict[str, list[float|None]])

    ``all_dates`` must be a tuple (not list) for ``@st.cache_data`` hashability.
    """
    # Build ISIN→name mapping from df_all
    isin_name: dict[str, str] = {}
    for _, _r in df_all.drop_duplicates("isin").iterrows():
        isin_name[_r["isin"]] = _r.get("name", _r["isin"])

    hold_months: list[float] = []
    hold_per_co: dict[str, list] = {}

    for _hd in all_dates:
        _hd_ts = pd.Timestamp(_hd)
        _hd_px: dict = {}
        _hd_rows = df_all[df_all["statement_date"] == _hd]
        for _, _hr in _hd_rows.iterrows():
            if pd.notna(_hr.get("shares")) and _hr["shares"] > 0:
                _hd_px[_hr["isin"]] = _hr["market_value_eur"] / _hr["shares"]
        _hd_tx = tx_all[tx_all["date"] <= _hd_ts]
        _hd_lots = compute_fifo_lots(_hd_tx, _hd_px)
        _hd_hp = compute_holding_periods(_hd_lots, today=_hd_ts)
        hold_months.append(round(_hd_hp.portfolio_avg_days / 30.44, 1))
        # Per-ISIN values (only for ISINs held at this date)
        for _isin, _days in _hd_hp.per_isin.items():
            _nm = isin_name.get(_isin, _isin)
            hold_per_co.setdefault(_nm, [None] * len(hold_months))
            # Pad if company appeared mid-way
            while len(hold_per_co[_nm]) < len(hold_months):
                hold_per_co[_nm].append(None)
            hold_per_co[_nm][-1] = round(_days / 30.44, 1)
        # Fill None for companies not in this date's lots
        for _nm in hold_per_co:
            if len(hold_per_co[_nm]) < len(hold_months):
                hold_per_co[_nm].append(None)

    return hold_months, hold_per_co


@st.cache_data
def compute_stock_vs_bm(
    isin: str,
    bm_raw: pd.DataFrame,
    df_all: pd.DataFrame,
    tx_all: pd.DataFrame,
    cum_dates: tuple,
    price_col: str = "index_eur",
) -> tuple:
    """Benchmark EUR value replicating the stock's actual cash flows.

    Key fix: bm_shares are initialised by replaying every buy/sell at
    its *actual* transaction date (not snapped to the statement date).
    This means the benchmark captures the same intra-period price
    movement as _pos_pe_series does for the stock itself.

    ``cum_dates`` must be a tuple (not list) for ``@st.cache_data`` hashability.
    """
    stock_vals: list = []
    for _d in cum_dates:
        _df_d = df_all[
            (df_all["statement_date"] == _d) & (df_all["isin"] == isin)
        ]
        stock_vals.append(
            float(_df_d["market_value_eur"].sum()) if len(_df_d) > 0 else 0.0
        )
    first_idx = next(
        (i for i, v in enumerate(stock_vals) if v > 0), None
    )
    if first_idx is None or bm_raw is None:
        return stock_vals, [None] * len(stock_vals)
    first_d = pd.Timestamp(cum_dates[first_idx])

    # Replay ALL transactions up to (and including) the first statement
    # date so intra-period buys are valued at their actual purchase price.
    early_tx = (
        tx_all[
            (tx_all["isin"] == isin)
            & (tx_all["direction"].isin(["buy", "sell"]))
            & (tx_all["date"] <= first_d)
        ]
        .sort_values("date")
    )
    bm_shares = 0.0
    for _, _tr in early_tx.iterrows():
        _px = bm_raw[price_col].asof(_tr["date"])
        if pd.notna(_px) and _px > 0:
            bm_shares += -_tr["amount_eur"] / _px
    # Fallback if no transactions found
    if bm_shares <= 0:
        _init_px = bm_raw[price_col].asof(first_d)
        if not (pd.notna(_init_px) and _init_px > 0):
            return stock_vals, [None] * len(stock_vals)
        bm_shares = stock_vals[first_idx] / _init_px

    # Process subsequent transactions (strictly after first statement date)
    _stx = (
        tx_all[
            (tx_all["isin"] == isin)
            & (tx_all["direction"].isin(["buy", "sell"]))
            & (tx_all["date"] > first_d)
        ]
        .sort_values("date")
        .reset_index(drop=True)
    )
    tx_idx = 0
    bm_vals: list = [None] * first_idx
    for i in range(first_idx, len(cum_dates)):
        d_ts = pd.Timestamp(cum_dates[i])
        if i > first_idx:
            while tx_idx < len(_stx):
                tx_r = _stx.iloc[tx_idx]
                if tx_r["date"] > d_ts:
                    break
                px = bm_raw[price_col].asof(tx_r["date"])
                if pd.notna(px) and px > 0:
                    bm_shares += -tx_r["amount_eur"] / px
                tx_idx += 1
        val_px = bm_raw[price_col].asof(d_ts)
        bm_vals.append(
            round(bm_shares * val_px, 2) if pd.notna(val_px) else None
        )
    return stock_vals, bm_vals


@st.cache_data
def compute_bm_cum_pe_for_stock(
    isin: str,
    bm_raw: pd.DataFrame,
    df_all: pd.DataFrame,
    tx_all: pd.DataFrame,
    cum_dates: tuple,
    price_col: str = "index_eur",
) -> list:
    """Benchmark cumulative price effect replicating one stock's cash flows.

    i == 0:              always 0 — matches _pos_pe_series which seeds 0 for
                         the first statement date regardless of when the stock
                         was bought (pre-statement gains are not tracked).
    i > 0, bv[i-1] None: stock first appears mid-portfolio; PE = bm_value[i]
                         minus total invested up to i — captures the same
                         intra-period gain that _pos_pe_series records.
    Normal periods:      bm_pe[i] = bm_value[i] - bm_value[i-1] - net_inv[i]

    ``cum_dates`` must be a tuple (not list) for ``@st.cache_data`` hashability.
    """
    _, _bv = compute_stock_vs_bm(isin, bm_raw, df_all, tx_all, cum_dates, price_col)
    _pe = []
    for i in range(len(cum_dates)):
        if _bv[i] is None or i == 0:
            # Not yet in portfolio, OR first statement date (always 0 by
            # convention — mirrors the _pos_pe_series seed of 0).
            _pe.append(0.0)
        elif _bv[i - 1] is None:
            # First period the stock appears mid-portfolio: capture the
            # intra-period gain from actual buy date(s) to statement date,
            # same as _pos_pe_series does for this period.
            _d_curr = pd.Timestamp(cum_dates[i])
            _tx_p = tx_all[
                (tx_all["isin"] == isin)
                & (tx_all["date"] <= _d_curr)
            ]
            _buys_i = _tx_p[_tx_p["direction"] == "buy"]["amount_eur"].abs().sum()
            _sells_i = _tx_p[_tx_p["direction"] == "sell"]["amount_eur"].sum()
            _net_inv = _buys_i - _sells_i
            _pe.append(_bv[i] - _net_inv)
        else:
            _d_prev = pd.Timestamp(cum_dates[i - 1])
            _d_curr = pd.Timestamp(cum_dates[i])
            _tx_p = tx_all[
                (tx_all["isin"] == isin)
                & (tx_all["date"] > _d_prev)
                & (tx_all["date"] <= _d_curr)
            ]
            _buys_i = _tx_p[_tx_p["direction"] == "buy"]["amount_eur"].abs().sum()
            _sells_i = _tx_p[_tx_p["direction"] == "sell"]["amount_eur"].sum()
            _net_inv = _buys_i - _sells_i
            _pe.append(_bv[i] - _bv[i - 1] - _net_inv)
    return list(pd.Series(_pe).cumsum())

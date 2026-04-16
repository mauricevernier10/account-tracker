"""
Trade Republic Portfolio Dashboard

Run with:
    streamlit run dashboard.py
"""

import pandas as pd
import plotly.graph_objects as go
import streamlit as st
import streamlit.components.v1 as components

import db
from constants import (
    ACCENT,
    BG,
    BM_COLORS,
    BORDER,
    CARD_BG,
    CHART_TITLE_SIZE,
    COLORS,
    FONT_STACK,
    MUTED,
    NEGATIVE,
    POSITIVE,
    TEXT,
)
from charts import (
    _layout,
    _vline,
    _line_chart,
    make_color_map,
    animated_bar_race,
    animated_pie_race,
    cumulative_fill_chart,
    MARGIN_STD,
    MARGIN_WIDE,
    MARGIN_COMPACT,
)
from data import (
    _parse_new_pdfs,
    load_all_statements,
    load_transactions,
    fetch_tickers,
    fetch_sp500_eur,
    fetch_index_eur,
    BENCHMARKS,
    compute_totals,
    compute_pivot,
    compute_ov_data,
    compute_benchmark,
    compute_fifo_lots,
    fifo_lot_perf,
    compute_holding_periods,
    compute_holding_period_series,
    compute_stock_vs_bm,
    compute_bm_cum_pe_for_stock,
    compute_performance_metrics,
    compute_performance_series,
    compute_realized_gains,
)
from parse_depot import RAW_DATA_DIR, parse_pdf
from parse_transactions import parse_account_statement, TRANSACTIONS_DIR


st.set_page_config(
    page_title="Trade Republic Portfolio",
    page_icon="📈",
    layout="wide",
)


_NAV = "[data-testid='stHorizontalBlock']:has([data-testid='stSelectbox']):has([data-testid='stBaseButton-secondary'])"
st.markdown(
    f"""<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

[data-testid="stMainBlockContainer"] *,
[data-testid="stSidebarUserContent"] * {{
    font-family: {FONT_STACK} !important;
}}

span.nav-anchor {{ display: none; }}

/* ── Page background ───────────────────────────────────────────────────── */
[data-testid="stAppViewContainer"] > .main {{
    background-color: {BG};
}}

/* ── Chart containers as cards ─────────────────────────────────────────── */
[data-testid="stPlotlyChart"] {{
    background: {CARD_BG};
    border: 1px solid {BORDER};
    border-radius: 12px;
    padding: 0.5rem;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    overflow: hidden !important;
}}
/* Prevent Plotly divs from capturing focus or scroll on click */
.js-plotly-plot, .js-plotly-plot * {{
    overflow: hidden !important;
}}

/* ── Dataframe container as card ───────────────────────────────────────── */
[data-testid="stDataFrame"] > div {{
    border: 1px solid {BORDER} !important;
    border-radius: 12px !important;
    overflow: hidden !important;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06) !important;
}}

/* ── Dividers ──────────────────────────────────────────────────────────── */
hr {{ border-color: {BORDER} !important; opacity: 1 !important; }}

/* ── KPI cards: equal height ───────────────────────────────────────────── */
[data-testid="stHorizontalBlock"]:has(.kpi-card) {{
    align-items: stretch !important;
}}
[data-testid="stColumn"]:has(.kpi-card) {{
    display: flex !important;
    flex-direction: column !important;
}}
[data-testid="stColumn"]:has(.kpi-card) > div,
[data-testid="stColumn"]:has(.kpi-card) > div > div {{
    flex: 1 !important;
    display: flex !important;
    flex-direction: column !important;
}}
.kpi-card {{ flex: 1 !important; }}

/* ── Fixed nav bar ─────────────────────────────────────────────────────── */
{_NAV} {{
    position: fixed !important;
    top: var(--header-height, 3.75rem) !important;
    left: 0 !important; right: 0 !important;
    z-index: 999 !important;
    background-color: {CARD_BG} !important;
    padding: 10px 2rem 12px !important;
    border-bottom: 1px solid {BORDER} !important;
    box-shadow: 0 1px 8px rgba(0,0,0,0.07) !important;
    align-items: center !important;
    gap: 4px !important;
}}
{_NAV} + * {{ margin-top: 4.5rem !important; }}

/* ── Column alignment ─────────────────────────────────────────────────── */
{_NAV} [data-testid="stColumn"] {{
    padding: 0 !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    min-height: 0 !important;
}}

/* ── Arrow buttons ─────────────────────────────────────────────────────── */
{_NAV} [data-testid="stColumn"]:nth-child(1) button,
{_NAV} [data-testid="stColumn"]:nth-child(2) button,
{_NAV} [data-testid="stColumn"]:nth-child(4) button,
{_NAV} [data-testid="stColumn"]:nth-child(5) button {{
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
    color: {TEXT} !important;
    font-size: 1.2rem !important;
    line-height: 1 !important;
    min-height: 0 !important;
    height: 28px !important;
    width: auto !important;
    padding: 0 8px !important;
    border-radius: 4px !important;
}}
{_NAV} [data-testid="stColumn"]:nth-child(1) button:hover,
{_NAV} [data-testid="stColumn"]:nth-child(2) button:hover,
{_NAV} [data-testid="stColumn"]:nth-child(4) button:hover,
{_NAV} [data-testid="stColumn"]:nth-child(5) button:hover {{
    background: rgba(0,0,0,0.05) !important;
}}
{_NAV} [data-testid="stColumn"]:nth-child(1) button:disabled,
{_NAV} [data-testid="stColumn"]:nth-child(2) button:disabled,
{_NAV} [data-testid="stColumn"]:nth-child(4) button:disabled,
{_NAV} [data-testid="stColumn"]:nth-child(5) button:disabled {{
    color: {MUTED} !important;
    opacity: 0.4 !important;
    cursor: default !important;
}}

/* ── Selectbox styling ─────────────────────────────────────────────────── */
{_NAV} [data-testid="stSelectbox"] > div > div {{
    border-color: {BORDER} !important;
    background: {CARD_BG} !important;
    min-height: 0 !important;
    height: 36px !important;
    padding: 0 12px !important;
}}

/* ── Overview HTML table ───────────────────────────────────────────────── */
.ov-table {{
    font-family: {FONT_STACK};
    font-size: 0.84rem;
    border-collapse: collapse;
    width: 100%;
}}
.ov-table th {{
    text-align: right;
    padding: 5px 14px;
    color: {MUTED};
    font-weight: 500;
    font-family: {FONT_STACK};
    font-size: 0.80rem;
    white-space: nowrap;
    border-bottom: 1px solid {BORDER};
}}
.ov-table th:first-child {{ text-align: left; min-width: 160px; }}
.ov-table td {{
    padding: 5px 14px;
    border-bottom: 1px solid {BORDER}44;
    font-family: {FONT_STACK};
    white-space: nowrap;
}}
.ov-table td:not(:first-child) {{ text-align: right; }}
.ov-table tr:last-child td {{ border-bottom: none; }}
.ov-bold td {{ font-weight: 600; }}
.ov-muted td {{ color: {MUTED}; }}
.ov-contrib td {{ color: {MUTED}; font-size: 0.80rem; }}

/* ── Holdings Detail table ─────────────────────────────────────────────── */
.hd-table {{
    font-family: {FONT_STACK};
    font-size: 0.84rem;
    border-collapse: collapse;
    width: 100%;
}}
.hd-table th {{
    text-align: right;
    padding: 5px 10px;
    color: {MUTED};
    font-weight: 500;
    font-family: {FONT_STACK};
    font-size: 0.80rem;
    white-space: nowrap;
    border-bottom: 1px solid {BORDER};
}}
.hd-table th:first-child {{ text-align: left; }}
.hd-table td {{
    padding: 5px 10px;
    border-bottom: 1px solid {BORDER}44;
    font-family: {FONT_STACK};
    white-space: nowrap;
}}
.hd-table td:not(:first-child) {{ text-align: right; }}
.hd-table tr:last-child td {{ border-bottom: none; }}
.hd-total td {{ font-weight: 600; background-color: #F3F4F6; }}
.hd-new td {{ background-color: #F0FDF4; }}
.hd-sold td {{ background-color: #FEF2F2; }}

/* ── Pills font ────────────────────────────────────────────────────────── */
[data-testid="stPillsInput"] * {{
    font-family: {FONT_STACK} !important;
}}

/* ── Hide popover dropdown arrow (Material Icon renders as text) ──────── */
[data-testid="stPopover"] button [data-testid="stIconMaterial"] {{
    display: none !important;
}}
[data-testid="stPopover"] button .material-symbols-rounded {{
    display: none !important;
}}

/* ── Hide expander arrow icon (renders as "_arrow_right" text) ─────────── */
[data-testid="stExpander"] summary [data-testid="stIconMaterial"] {{
    display: none !important;
}}
[data-testid="stExpander"] summary .material-symbols-rounded {{
    display: none !important;
}}
</style>""",
    unsafe_allow_html=True,
)

# Forward wheel events from Plotly chart divs to the page so charts don't
# hijack scrolling. Runs inside a same-origin components iframe which can
# access window.parent.document.
components.html(
    """
    <script>1
    (function () {
        var pd = window.parent.document;
        function attach(el) {
            if (el._scrollPatched) return;
            el._scrollPatched = true;
            // Forward wheel events to the page regardless of chart focus state
            el.addEventListener('wheel', function (e) {
                window.parent.scrollBy({ top: e.deltaY, left: e.deltaX, behavior: 'instant' });
            }, { passive: true, capture: true });
            // On click, immediately blur the chart so focus returns to the page
            el.addEventListener('mousedown', function () {
                setTimeout(function () { el.blur(); pd.body.focus(); }, 0);
            }, { capture: true });
        }
        function patchAll() {
            pd.querySelectorAll('.js-plotly-plot').forEach(attach);
        }
        patchAll();
        new MutationObserver(patchAll).observe(pd.body, { childList: true, subtree: true });

        // Keyboard arrow navigation
        function clickNavBtn(text) {
            var btns = pd.querySelectorAll('button');
            for (var i = 0; i < btns.length; i++) {
                if (btns[i].textContent.trim() === text && !btns[i].disabled) {
                    btns[i].click();
                    return;
                }
            }
        }
        function onKey(e) {
            var el = pd.activeElement || {};
            var tag  = el.tagName || '';
            var role = (el.getAttribute && el.getAttribute('role')) || '';
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            if (role === 'tab') return;
            if (e.key === 'ArrowLeft')  clickNavBtn('←');
            if (e.key === 'ArrowRight') clickNavBtn('→');
        }
        pd.addEventListener('keydown', onKey);
        window.addEventListener('keydown', onKey);
    })();
    </script>
    """,
    height=0,
)


def _dc(v: float) -> str:
    """Return POSITIVE / NEGATIVE / MUTED color constant based on sign."""
    return POSITIVE if v > 0 else (NEGATIVE if v < 0 else MUTED)


def _kpi(
    col,
    label,
    value_str,
    *,
    value_color=TEXT,
    delta_str=None,
    delta_color=None,
    delta_suffix=" from last statement",
    tooltip=None,
    subtitle=None,
):
    _title = f" title='{tooltip}'" if tooltip else ""
    html = (
        f"<div class='kpi-card'{_title} style='background:{CARD_BG};border:1px solid {BORDER};"
        f"border-radius:12px;padding:1.25rem 1.5rem 1.1rem;"
        f"box-shadow:0 1px 3px rgba(0,0,0,0.05);cursor:default;'>"
        f"<p style='font-size:0.9rem;color:{MUTED};margin:0 0 0.5rem;font-weight:400;'>{label}</p>"
        f"<p style='font-size:2rem;font-weight:800;color:{value_color};margin:0;line-height:1.15;"
        f"letter-spacing:-0.02em;'>{value_str}</p>"
    )
    if delta_str is not None:
        html += (
            f"<p style='font-size:0.72rem;margin:0.5rem 0 0;white-space:nowrap;overflow:hidden;"
            f"text-overflow:ellipsis;'>"
            f"<span style='color:{delta_color or MUTED};font-weight:500;'>{delta_str}</span>"
            f"<span style='color:{MUTED};font-weight:400;'>{delta_suffix}</span>"
            f"</p>"
        )
    if subtitle is not None:
        html += (
            f"<p style='font-size:0.68rem;color:{MUTED};margin:0.6rem 0 0;"
            f"font-style:italic;line-height:1.4;opacity:0.8;'>{subtitle}</p>"
        )
    html += "</div>"
    col.markdown(html, unsafe_allow_html=True)


# Initialize DB (migrates from CSVs/JSON on first run) and parse new PDFs
if "pdfs_parsed" not in st.session_state:
    db.setup()
    _warnings, _changed = _parse_new_pdfs()
    if _changed:
        load_all_statements.clear()
    for _w in _warnings:
        st.warning(_w)
    st.session_state.pdfs_parsed = True

df_all = load_all_statements()
if df_all.empty:
    st.error("No data found. Add a PDF to the 'raw data' folder.")
    st.stop()

_tx_all = load_transactions()

# Resolve all ISINs (holdings + transactions) in one cached call
_all_tickers = fetch_tickers(
    tuple(
        sorted(
            set(df_all["isin"].dropna().unique())
            | set(_tx_all["isin"].dropna().unique())
        )
    )
)
_holdings_tickers = _all_tickers
df_all["name"] = df_all["isin"].map(_all_tickers).fillna(df_all["name"])

all_dates = sorted(df_all["statement_date"].unique())
_date_idx = {d: i for i, d in enumerate(all_dates)}
depot = df_all["depot"].iloc[0]
COLOR_MAP = make_color_map(df_all["name"].tolist())


def _tx_between(tx: pd.DataFrame, d_from, d_to) -> pd.DataFrame:
    """Filter transactions strictly after d_from and up to and including d_to."""
    return tx[(tx["date"] > pd.Timestamp(d_from)) & (tx["date"] <= pd.Timestamp(d_to))]


# ── Sidebar removed — content moved to Settings tab ──────────────────────


# ── Statement selector ────────────────────────────────────────────────────

if (
    "nav_selectbox" not in st.session_state
    or st.session_state.nav_selectbox not in all_dates
):
    st.session_state.nav_selectbox = all_dates[-1]

st.markdown('<span class="nav-anchor"></span>', unsafe_allow_html=True)

_cur_idx = _date_idx[st.session_state.nav_selectbox]

# Pre-compute per-statement totals for nav label
_nav_totals = df_all.groupby("statement_date")["market_value_eur"].sum()


def _nav_label(d):
    total = _nav_totals[d]
    idx = _date_idx[d]
    if idx > 0:
        prev = _nav_totals[all_dates[idx - 1]]
        delta = total - prev
        pct = delta / prev * 100 if prev else 0
        sign = "+" if delta >= 0 else ""
        return f"{d.strftime('%b %Y')}  ·  €{total:,.0f}  {sign}{delta:,.0f} ({sign}{pct:.1f}%)"
    return f"{d.strftime('%b %Y')}  ·  €{total:,.0f}"


# on_click callbacks run at the start of the next rerun, before any widget
# is instantiated, so setting nav_selectbox there is always safe.
def _go_first():
    st.session_state.nav_selectbox = all_dates[0]


def _go_prev():
    i = _date_idx.get(st.session_state.get("nav_selectbox", all_dates[-1]), 0)
    st.session_state.nav_selectbox = all_dates[max(0, i - 1)]


def _go_next():
    i = _date_idx.get(st.session_state.get("nav_selectbox", all_dates[-1]), 0)
    st.session_state.nav_selectbox = all_dates[min(len(all_dates) - 1, i + 1)]


def _go_last():
    st.session_state.nav_selectbox = all_dates[-1]


_nav_first, _nav_prev, _nav_select, _nav_next, _nav_last, _nav_upload = st.columns(
    [1, 1, 10, 1, 1, 3]
)

with _nav_first:
    st.button(
        "|←",
        key="nav_first",
        disabled=_cur_idx == 0,
        use_container_width=True,
        on_click=_go_first,
    )

with _nav_prev:
    st.button(
        "←",
        key="nav_prev",
        disabled=_cur_idx == 0,
        use_container_width=True,
        on_click=_go_prev,
    )

with _nav_select:
    selected_date = st.selectbox(
        "Statement",
        options=all_dates,
        key="nav_selectbox",
        format_func=_nav_label,
        label_visibility="collapsed",
    )

with _nav_next:
    st.button(
        "→",
        key="nav_next",
        disabled=_cur_idx == len(all_dates) - 1,
        use_container_width=True,
        on_click=_go_next,
    )

with _nav_last:
    st.button(
        "→|",
        key="nav_last",
        disabled=_cur_idx == len(all_dates) - 1,
        use_container_width=True,
        on_click=_go_last,
    )

with _nav_upload:
    with st.popover("＋ New Statement", use_container_width=True):
        _up_portfolio, _up_transactions = st.tabs(["📊 Portfolio", "💳 Transactions"])
        with _up_portfolio:
            st.caption("Monthly portfolio snapshot PDF")
            _up_file = st.file_uploader(
                "Portfolio PDF",
                type="pdf",
                key="upload_portfolio",
                label_visibility="collapsed",
            )
            if _up_file is not None:
                dest = RAW_DATA_DIR / _up_file.name
                if dest.exists():
                    st.info(f"**{_up_file.name}** already loaded.")
                else:
                    try:
                        RAW_DATA_DIR.mkdir(exist_ok=True)
                        dest.write_bytes(_up_file.getvalue())
                        df_new = parse_pdf(dest)
                        db.upsert_statement(df_new)
                        load_all_statements.clear()
                        st.success(f"✓ Loaded {df_new['statement_date'].iloc[0]}")
                        st.rerun()
                    except Exception as e:
                        dest.unlink(missing_ok=True)
                        st.error(f"Parse failed: {e}")

        with _up_transactions:
            st.caption("Account statement PDF (transactions)")
            _up_tx = st.file_uploader(
                "Transaction PDF",
                type="pdf",
                key="upload_tx",
                label_visibility="collapsed",
            )
            if _up_tx is not None:
                dest = TRANSACTIONS_DIR / _up_tx.name
                if dest.exists():
                    st.info(f"**{_up_tx.name}** already loaded.")
                else:
                    try:
                        TRANSACTIONS_DIR.mkdir(exist_ok=True)
                        dest.write_bytes(_up_tx.getvalue())
                        df_tx_new = parse_account_statement(dest)
                        n_new = db.upsert_transactions(df_tx_new)
                        load_transactions.clear()
                        st.success(
                            f"✓ {n_new} new transactions from "
                            f"{df_tx_new['date'].min().strftime('%b %Y')} – "
                            f"{df_tx_new['date'].max().strftime('%b %Y')}"
                        )
                        st.rerun()
                    except Exception as e:
                        dest.unlink(missing_ok=True)
                        st.error(f"Parse failed: {e}")

_new_idx = _date_idx[selected_date]
prev_date = all_dates[_new_idx - 1] if _new_idx > 0 else None

df_sel = df_all[df_all["statement_date"] == selected_date].copy()
df_prev = (
    df_all[df_all["statement_date"] == prev_date].copy()
    if prev_date is not None
    else None
)

total_value = df_sel["market_value_eur"].sum()
prev_total = df_prev["market_value_eur"].sum() if df_prev is not None else None

# ── Shared benchmark setup (used by Overview + Performance tabs) ──────────
_bm_name = list(BENCHMARKS.keys())[0]
_bm_cfg = BENCHMARKS[_bm_name]
_bm_raw = None
_sp_raw = None
_bm_tx_values = None
_all_bm_raw: dict = {}
_all_bm_tx_values: dict = {}
df_totals = None
_date_start = ""
_date_end = ""

if len(all_dates) > 1:
    df_totals = compute_totals(df_all)
    _date_start = (
        df_totals["statement_date"].iloc[0] - pd.Timedelta(days=7)
    ).strftime("%Y-%m-%d")
    _date_end = (pd.Timestamp.today() + pd.Timedelta(days=2)).strftime("%Y-%m-%d")
    _bm_col, _ = st.columns([2, 6])
    with _bm_col:
        _bm_name = st.selectbox(
            "Benchmark",
            options=list(BENCHMARKS.keys()),
            index=0,
            key="benchmark_selector",
        )
    _bm_cfg = BENCHMARKS[_bm_name]
    try:
        _bm_raw = fetch_index_eur(_bm_cfg["ticker"], _date_start, _date_end)
        if _bm_cfg["ticker"] == "^GSPC":
            _sp_raw = _bm_raw
        else:
            _sp_raw = fetch_index_eur("^GSPC", _date_start, _date_end)
    except Exception:
        pass
    st.session_state["_dialog_bm_raw"]  = _bm_raw
    st.session_state["_dialog_bm_name"] = _bm_name
    _bm_tx_values = (
        compute_benchmark(df_totals, _tx_all, _bm_raw, price_col="index_eur")
        if _bm_raw is not None
        else None
    )
    for _bm_n, _bm_c in BENCHMARKS.items():
        try:
            _raw = fetch_index_eur(_bm_c["ticker"], _date_start, _date_end)
            _vals = compute_benchmark(
                df_totals, _tx_all, _raw, price_col="index_eur"
            )
            if _vals and any(v is not None for v in _vals):
                _all_bm_raw[_bm_n] = _raw
                _all_bm_tx_values[_bm_n] = _vals
        except Exception:
            pass


_tab_main, _tab_perf, _tab_act, _tab_tx, _tab_tax, _tab_settings = st.tabs(
    ["Overview", "Performance", "Activity", "Transactions", "Tax", "Settings"]
)


def _render_position_panel(isin: str) -> None:
    """Inline drill-down panel for a single holding — all tiers."""
    _pos_rows = df_sel[df_sel["isin"] == isin]
    if _pos_rows.empty:
        st.warning("Position not found in the selected statement.")
        return
    with st.container(border=True):
        _row    = _pos_rows.iloc[0]
        _name   = _row["name"]
        _shares = float(_row.get("shares", 0) or 0)
        _price  = float(_row.get("price_eur", 0) or 0)
        _mv     = float(_row.get("market_value_eur", 0) or 0)
        _clr    = COLOR_MAP.get(_name, ACCENT)

        _ph_left, _ph_right = st.columns([8, 1])
        _ph_left.subheader(_name)
        _ph_right.caption(f"ISIN: `{isin}`")

        # ── Core P&L ──────────────────────────────────────────────────────────
        _pos_tx    = _tx_all[_tx_all["isin"] == isin]
        _buys_tot  = _pos_tx[_pos_tx["direction"] == "buy"]["amount_eur"].abs().sum()
        _sells_tot = _pos_tx[_pos_tx["direction"] == "sell"]["amount_eur"].sum()
        _net_inv   = round(_buys_tot - _sells_tot, 2)
        _perf_eur  = round(_mv - _net_inv, 2)
        _perf_pct  = _perf_eur / _net_inv * 100 if _net_inv else 0
        _div_total = _pos_tx[_pos_tx["direction"] == "dividend"]["amount_eur"].sum()

        # ── FIFO lots (shared by multiple sections) ────────────────────────────
        _curr_px_d = {isin: _price} if _price else {}
        _lots      = compute_fifo_lots(_pos_tx, _curr_px_d)
        _realised  = sum(l.sold_proceeds - l.qty_sold * l.buy_price for l in _lots if l.qty_sold > 0)
        _unreal    = sum(l.qty_remaining * (_price - l.buy_price) for l in _lots if l.qty_remaining > 0 and _price)
        _rem_qty   = sum(l.qty_remaining for l in _lots)
        _rem_cost  = sum(l.qty_remaining * l.buy_price for l in _lots if l.qty_remaining > 0)
        _avg_cost  = _rem_cost / _rem_qty if _rem_qty > 0 else None

        # ── KPI Row 1 ─────────────────────────────────────────────────────────
        _k1, _k2, _k3, _k4 = st.columns(4)
        _kpi(_k1, "Market Value",  f"{_mv:,.0f} €")
        _kpi(_k2, "Shares",        f"{_shares:,.3f}")
        _kpi(_k3, "Net Invested",  f"{_net_inv:,.0f} €")
        _kpi(_k4, "All-time Perf", f"{_perf_eur:+,.0f} €",
             value_color=_dc(_perf_eur),
             delta_str=f"{_perf_pct:+.1f}%",
             delta_color=_dc(_perf_pct),
             delta_suffix="")

        # ── KPI Row 2: Unrealised / Realised / Dividends / Avg Cost ───────────
        st.markdown("<div style='margin-top:0.75rem'></div>", unsafe_allow_html=True)
        _r1, _r2, _r3, _r4 = st.columns(4)
        _kpi(_r1, "Unrealised P&L", f"{_unreal:+,.0f} €",
             value_color=_dc(_unreal), delta_suffix="")
        _kpi(_r2, "Realised P&L",   f"{_realised:+,.0f} €",
             value_color=_dc(_realised), delta_suffix="")
        _kpi(_r3, "Dividends",      f"{_div_total:,.2f} €")
        _kpi(_r4, "Avg Cost Basis",
             f"{_avg_cost:,.2f} €" if _avg_cost else "—",
             delta_str=(f"{(_price - _avg_cost) / _avg_cost * 100:+.1f}% vs current" if _avg_cost and _price else None),
             delta_color=(_dc(_price - _avg_cost) if _avg_cost and _price else None),
             delta_suffix="")

        st.divider()

        # ── Price vs cost basis  +  Weight over time ──────────────────────────
        _hist = (
            df_all[df_all["isin"] == isin]
            .sort_values("statement_date")
            .reset_index(drop=True)
        )
        if len(_hist) >= 1:
            _pc_col, _wt_col = st.columns(2)

            # Price per share + avg cost basis + buy/sell markers
            with _pc_col:
                st.markdown("**Price vs Cost Basis**")
                _pfig = go.Figure()
                _pfig.add_trace(go.Scatter(
                    x=_hist["statement_date"], y=_hist["price_eur"],
                    mode="lines+markers", name="Price",
                    line=dict(color=_clr, width=2), marker=dict(size=4),
                    hovertemplate="%{x|%b %Y}<br><b>%{y:,.2f} €</b><extra></extra>",
                ))
                if _avg_cost:
                    _pfig.add_hline(
                        y=_avg_cost,
                        line=dict(color=MUTED, width=1.5, dash="dash"),
                        annotation_text=f"Avg cost  {_avg_cost:,.2f} €",
                        annotation_position="bottom right",
                        annotation_font=dict(color=MUTED, size=10),
                    )
                _buy_tx = _pos_tx[
                    (_pos_tx["direction"] == "buy") &
                    (_pos_tx["quantity"].notna()) & (_pos_tx["quantity"] > 0)
                ].copy()
                if not _buy_tx.empty:
                    _buy_tx["tx_price"] = _buy_tx["amount_eur"].abs() / _buy_tx["quantity"]
                    _pfig.add_trace(go.Scatter(
                        x=_buy_tx["date"], y=_buy_tx["tx_price"],
                        mode="markers", name="Buy",
                        marker=dict(symbol="triangle-up", size=9, color=POSITIVE),
                        hovertemplate="Buy  %{x|%Y-%m-%d}<br><b>%{y:,.2f} €</b><extra></extra>",
                    ))
                _sell_tx = _pos_tx[
                    (_pos_tx["direction"] == "sell") &
                    (_pos_tx["quantity"].notna()) & (_pos_tx["quantity"] > 0)
                ].copy()
                if not _sell_tx.empty:
                    _sell_tx["tx_price"] = _sell_tx["amount_eur"].abs() / _sell_tx["quantity"]
                    _pfig.add_trace(go.Scatter(
                        x=_sell_tx["date"], y=_sell_tx["tx_price"],
                        mode="markers", name="Sell",
                        marker=dict(symbol="triangle-down", size=9, color=NEGATIVE),
                        hovertemplate="Sell  %{x|%Y-%m-%d}<br><b>%{y:,.2f} €</b><extra></extra>",
                    ))
                _pfig.update_layout(**_layout(
                    height=250, margin=dict(l=60, r=20, t=10, b=50),
                    showlegend=True,
                    legend=dict(orientation="h", y=-0.28, x=0.5, xanchor="center",
                                font=dict(size=10)),
                    yaxis=dict(tickformat=",.0f", ticksuffix=" €"),
                ))
                _vline(_pfig, selected_date)
                st.plotly_chart(_pfig, use_container_width=True, config={"scrollZoom": False})

            # Portfolio weight over time
            with _wt_col:
                st.markdown("**Portfolio Weight Over Time**")
                _totals_by_date = df_all.groupby("statement_date")["market_value_eur"].sum()
                _hist_wt = _hist.copy()
                _hist_wt["weight_pct"] = _hist_wt.apply(
                    lambda r: r["market_value_eur"]
                    / _totals_by_date.get(r["statement_date"], float("nan")) * 100,
                    axis=1,
                )
                _wfig = go.Figure()
                _wfig.add_trace(go.Scatter(
                    x=_hist_wt["statement_date"], y=_hist_wt["weight_pct"],
                    mode="lines+markers",
                    line=dict(color=COLORS[2], width=2), marker=dict(size=4),
                    fill="tozeroy", fillcolor="rgba(217,119,6,0.08)",
                    hovertemplate="%{x|%b %Y}<br><b>%{y:.1f}%</b><extra></extra>",
                    showlegend=False,
                ))
                _wfig.update_layout(**_layout(
                    height=250, margin=dict(l=50, r=20, t=10, b=50),
                    yaxis=dict(tickformat=".1f", ticksuffix="%"),
                ))
                _vline(_wfig, selected_date)
                st.plotly_chart(_wfig, use_container_width=True, config={"scrollZoom": False})

        # ── Benchmark comparison ───────────────────────────────────────────────
        _bm_raw_d  = st.session_state.get("_dialog_bm_raw")
        _bm_name_d = st.session_state.get("_dialog_bm_name", "Benchmark")
        if _bm_raw_d is not None and len(all_dates) > 1:
            _sv, _bv = compute_stock_vs_bm(
                isin, _bm_raw_d, df_all, _tx_all, tuple(all_dates)
            )
            if any(v is not None for v in _bv):
                st.markdown(f"**{_name} vs {_bm_name_d}** (same cash flows invested in index)")
                _bm_fig = go.Figure()
                _bm_fig.add_trace(go.Scatter(
                    x=list(all_dates), y=_sv, name=_name,
                    mode="lines+markers",
                    line=dict(color=_clr, width=2), marker=dict(size=4),
                    hovertemplate=f"{_name}<br>%{{x|%b %Y}}<br><b>%{{y:,.0f}} €</b><extra></extra>",
                ))
                _bm_fig.add_trace(go.Scatter(
                    x=list(all_dates), y=_bv, name=_bm_name_d,
                    mode="lines+markers",
                    line=dict(color=BM_COLORS.get(_bm_name_d, MUTED), width=2, dash="dash"),
                    marker=dict(size=4),
                    hovertemplate=f"{_bm_name_d}<br>%{{x|%b %Y}}<br><b>%{{y:,.0f}} €</b><extra></extra>",
                ))
                _bm_fig.update_layout(**_layout(
                    height=240, margin=dict(l=60, r=20, t=10, b=50),
                    showlegend=True,
                    legend=dict(orientation="h", y=-0.28, x=0.5, xanchor="center",
                                font=dict(size=10)),
                ))
                _vline(_bm_fig, selected_date)
                st.plotly_chart(_bm_fig, use_container_width=True, config={"scrollZoom": False})

        # ── Value change decomposition ─────────────────────────────────────────
        if len(all_dates) > 1:
            st.divider()
            st.markdown("**Value Change Decomposition**")
            _df_stk = (
                df_all[df_all["isin"] == isin]
                .sort_values("statement_date")[
                    ["statement_date", "market_value_eur"]
                ]
                .reset_index(drop=True)
            )
            if len(_df_stk) >= 2:
                _dperiods, _dpe, _die, _dvals = [], [], [], []
                _r0 = _df_stk.iloc[0]
                _dperiods.append(_r0["statement_date"].strftime("%b %Y"))
                _dpe.append(0.0)
                _die.append(_r0["market_value_eur"])
                _dvals.append(_r0["market_value_eur"])
                for _di in range(1, len(_df_stk)):
                    _dp, _dc2 = _df_stk.iloc[_di - 1], _df_stk.iloc[_di]
                    _dperiods.append(
                        f"{_dp['statement_date'].strftime('%b %y')} → "
                        f"{_dc2['statement_date'].strftime('%b %y')}"
                    )
                    _dvals.append(_dc2["market_value_eur"])
                    _dtx = _tx_between(_tx_all, _dp["statement_date"], _dc2["statement_date"])
                    _dtx = _dtx[_dtx["isin"] == isin]
                    _db  = _dtx[_dtx["direction"] == "buy"]["amount_eur"].abs().sum()
                    _ds  = _dtx[_dtx["direction"] == "sell"]["amount_eur"].sum()
                    _dpe.append(round(_dc2["market_value_eur"] - _dp["market_value_eur"] - _db + _ds, 2))
                    _die.append(round(_db - _ds, 2))
                _last_stk_date = _df_stk["statement_date"].iloc[-1]
                _later = all_dates[_date_idx[_last_stk_date] + 1:]
                if _later:
                    _dperiods.append(
                        f"{_last_stk_date.strftime('%b %y')} → {_later[0].strftime('%b %y')}"
                    )
                    _dpe.append(0.0)
                    _die.append(-round(_df_stk.iloc[-1]["market_value_eur"], 2))
                    _dvals.append(0.0)
                _dmatch = _df_stk.index[_df_stk["statement_date"] == selected_date]
                _dvline_x = _dperiods[_dmatch[0]] if len(_dmatch) else None
                _dlabels = [""] * len(_dvals)
                _dlabels[-1] = f"{_dvals[-1]:,.0f}"
                _dfig = go.Figure()
                _dfig.add_trace(go.Scatter(
                    x=_dperiods, y=_dvals, name="Market value",
                    mode="lines+markers+text", text=_dlabels,
                    textposition="middle right", cliponaxis=False,
                    textfont=dict(color=TEXT, size=10),
                    line=dict(color=TEXT, width=2, dash="dot"), marker=dict(size=5),
                    hovertemplate="%{x}<br>Market value: <b>%{y:,.0f}</b><extra></extra>",
                ))
                _dfig.add_trace(go.Bar(
                    x=_dperiods, y=_dpe, name="Price appreciation", yaxis="y2",
                    marker_color=[POSITIVE if v >= 0 else NEGATIVE for v in _dpe],
                    hovertemplate="%{x}<br>Price effect: <b>%{y:,.0f}</b><extra></extra>",
                ))
                _dfig.add_trace(go.Bar(
                    x=_dperiods, y=_die, name="Net investment", yaxis="y2",
                    marker_color=[ACCENT if v >= 0 else COLORS[2] for v in _die],
                    hovertemplate="%{x}<br>Net invested: <b>%{y:,.0f}</b><extra></extra>",
                ))
                if _dvline_x:
                    _dfig.add_vline(x=_dvline_x, line=dict(color=MUTED, width=1, dash="dash"))
                _dfig.update_layout(**_layout(
                    barmode="relative",
                    xaxis=dict(tickmode="array", tickvals=_dperiods, tickangle=-30),
                    yaxis=dict(title=dict(text="Market value (€)", font=dict(color=MUTED)),
                               range=[0, max(_dvals) * 1.3] if _dvals else None,
                               showgrid=True),
                    yaxis2=dict(overlaying="y", side="right",
                                title=dict(text="Period change (€)", font=dict(color=MUTED)),
                                tickfont=dict(color=MUTED), showgrid=False,
                                zeroline=True, zerolinecolor=BORDER, zerolinewidth=1),
                    height=360,
                    margin=dict(l=60, r=80, t=10, b=140),
                    showlegend=True,
                    legend=dict(bgcolor="rgba(255,255,255,0.9)", bordercolor=BORDER,
                                font=dict(color=TEXT, size=11), orientation="h",
                                x=0.5, xanchor="center", y=-0.38),
                ))
                st.plotly_chart(_dfig, use_container_width=True, config={"scrollZoom": False})

                # Cumulative price effect + net invested
                _d_cum_dates = list(_df_stk["statement_date"])
                if _later:
                    _d_cum_dates.append(_later[0])
                _d_cum_price  = list(pd.Series(_dpe).cumsum())
                _d_cum_invest = list(pd.Series(_die).cumsum())
                _cum_l, _cum_r = st.columns(2)
                _cum_l.plotly_chart(
                    cumulative_fill_chart(
                        _d_cum_dates, _d_cum_price,
                        "Cumulative Price Effect",
                        POSITIVE, "rgba(22,163,74,0.08)", selected_date,
                    ),
                    use_container_width=True,
                )
                _cum_r.plotly_chart(
                    cumulative_fill_chart(
                        _d_cum_dates, _d_cum_invest,
                        "Cumulative Net Invested",
                        ACCENT, "rgba(37,99,235,0.08)", selected_date,
                    ),
                    use_container_width=True,
                )

                # Number of shares over time
                _df_stk_sh = (
                    df_all[df_all["isin"] == isin]
                    .sort_values("statement_date")
                    .reset_index(drop=True)
                )
                _sh_dates  = list(_df_stk_sh["statement_date"])
                _sh_values = list(_df_stk_sh["shares"])
                if _later:
                    _sh_dates.append(_later[0])
                    _sh_values.append(0.0)
                _sh_end = f"{_sh_values[-1]:,.4f}" if _sh_values[-1] != 0.0 else ""
                _sh_fig = _line_chart(
                    _sh_dates, _sh_values, ACCENT,
                    title="Number of Shares",
                    y_range=[0, max(_sh_values) * 1.2] if _sh_values else None,
                    height=240, margin=MARGIN_WIDE,
                    marker_size=5, end_label=_sh_end,
                )
                _vline(_sh_fig, selected_date)
                st.plotly_chart(_sh_fig, use_container_width=True, config={"scrollZoom": False})

        # ── Holding period over time ───────────────────────────────────────────
        with st.expander("Holding Period Over Time"):
            _, _hold_per_co = compute_holding_period_series(df_all, _tx_all, tuple(all_dates))
            _hp_vals  = _hold_per_co.get(_name, [])
            _hp_dates = list(all_dates)[: len(_hp_vals)]
            if len(_hp_dates) > 1:
                _hpfig = go.Figure()
                _hpfig.add_trace(go.Scatter(
                    x=_hp_dates, y=_hp_vals,
                    mode="lines+markers", connectgaps=False,
                    line=dict(color=ACCENT, width=2), marker=dict(size=4),
                    hovertemplate="%{x|%b %Y}<br><b>%{y:.1f} months</b><extra></extra>",
                    showlegend=False,
                ))
                _hpfig.update_layout(**_layout(
                    height=220, margin=dict(l=50, r=20, t=10, b=50),
                    yaxis=dict(tickformat=".0f", ticksuffix="m"),
                ))
                _vline(_hpfig, selected_date)
                st.plotly_chart(_hpfig, use_container_width=True, config={"scrollZoom": False})
            else:
                st.caption("Not enough data for holding period evolution.")

        # ── Transaction history ────────────────────────────────────────────────
        with st.expander("Transaction History"):
            _rel_tx = (
                _pos_tx[_pos_tx["direction"].isin(
                    ["buy", "sell", "dividend", "interest", "saveback"]
                )]
                .sort_values("date", ascending=False)
                .copy()
            )
            if not _rel_tx.empty:
                _tx_rows = []
                for _, _txr in _rel_tx.iterrows():
                    _qty    = _txr.get("quantity")
                    _approx = bool(_txr.get("approx", 0))
                    _tpx    = abs(_txr["amount_eur"]) / _qty if (_qty and _qty > 0) else None
                    _prefix = "~" if _approx else ""
                    _tx_rows.append({
                        "Date":      _txr["date"].strftime("%Y-%m-%d"),
                        "Direction": _txr["direction"].capitalize(),
                        "Qty":       f"{_prefix}{_qty:,.4f}" if _qty else "—",
                        "Tx Price":  f"{_prefix}{_tpx:,.2f} €" if _tpx else "—",
                        "Amount":    f"{_txr['amount_eur']:+,.2f} €",
                    })
                st.dataframe(pd.DataFrame(_tx_rows), hide_index=True, use_container_width=True)
            else:
                st.caption("No transactions found.")

        # ── FIFO lots + dividends + tax preview ───────────────────────────────
        with st.expander("FIFO Lots & Tax Preview"):
            if _lots:
                _lot_rows = []
                for _lot in sorted(_lots, key=lambda l: l.buy_date):
                    _lrc   = _lot.qty_remaining * _lot.buy_price
                    _lrv   = _lot.qty_remaining * _price if _price else None
                    _lu    = round(_lrv - _lrc, 2) if _lrv is not None and _lot.qty_remaining > 0 else None
                    _lupct = _lu / _lrc * 100 if (_lu is not None and _lrc) else None
                    _st    = ("Open" if _lot.qty_sold == 0
                              else ("Closed" if _lot.qty_remaining < 0.0001 else "Partial"))
                    _lot_rows.append({
                        "Buy Date":  _lot.buy_date.strftime("%Y-%m-%d"),
                        "Shares":    round(_lot.qty_total, 4),
                        "Remaining": round(_lot.qty_remaining, 4),
                        "Buy Price": f"{_lot.buy_price:,.2f} €",
                        "Status":    _st,
                        "Unrealised": f"{_lu:+,.0f} €" if _lu is not None else "—",
                        "P&L %":     f"{_lupct:+.1f}%" if _lupct is not None else "—",
                    })
                st.dataframe(pd.DataFrame(_lot_rows), hide_index=True, use_container_width=True)
            _divs = _pos_tx[_pos_tx["direction"] == "dividend"].sort_values("date")
            if not _divs.empty:
                st.markdown(f"**Dividends** — Total: {_div_total:,.2f} €")
                st.dataframe(
                    pd.DataFrame([
                        {"Date": r["date"].strftime("%Y-%m-%d"),
                         "Amount": f"{r['amount_eur']:,.2f} €"}
                        for _, r in _divs.iterrows()
                    ]),
                    hide_index=True, use_container_width=True,
                )
            _gross   = _perf_eur + _div_total
            _tax_est = round(max(_gross, 0) * 0.26375, 2)
            if _gross > 0:
                st.caption(
                    f"**Tax preview (if sold today):** unrealised {_perf_eur:+,.0f} € + "
                    f"dividends {_div_total:,.2f} € → gross **{_gross:,.0f} €** → "
                    f"est. **{_tax_est:,.0f} €** (26.375%, before Freistellungsauftrag)"
                )


def _render_overview_tab():
    # ── KPI metrics ───────────────────────────────────────────────────────────
    m1, m2, m3, m4 = st.columns(4)

    prev_count = len(df_prev) if df_prev is not None else None
    prev_avg = prev_total / prev_count if prev_count else None
    curr_avg = total_value / len(df_sel)

    # Compute price vs. investment decomposition of total portfolio change (tx-based)
    if df_prev is not None:
        _tx_sel = _tx_between(_tx_all, prev_date, selected_date)
        _buys_sel = _tx_sel[_tx_sel["direction"] == "buy"]["amount_eur"].abs().sum()
        _sells_sel = _tx_sel[_tx_sel["direction"] == "sell"]["amount_eur"].sum()
        _price_delta_total = round(total_value - prev_total - _buys_sel + _sells_sel, 2)
        _invest_delta_total = round(_buys_sel - _sells_sel, 2)

    _d_total = total_value - prev_total if prev_total is not None else None
    _d_count = len(df_sel) - prev_count if prev_count is not None else None
    _d_avg = curr_avg - prev_avg if prev_avg is not None else None

    # Percentage changes vs. previous statement
    def _pct_str(change, base):
        if change is None or not base:
            return None
        return f"{change / abs(base) * 100:+.1f}%"

    _kpi(
        m1,
        "Total Value",
        f"{total_value:,.0f} €",
        delta_str=(
            f"{_d_total:+,.0f} € ({_pct_str(_d_total, prev_total)})"
            if _d_total is not None
            else None
        ),
        delta_color=(_dc(_d_total) if _d_total is not None else None),
    )
    _kpi(
        m2,
        "Positions",
        str(len(df_sel)),
        delta_str=(f"{_d_count:+}" if _d_count is not None else None),
        delta_color=(_dc(_d_count) if _d_count is not None else None),
    )

    if df_prev is not None:
        _kpi(
            m3,
            "Price Delta",
            f"{_price_delta_total:+,.0f} €",
            value_color=_dc(_price_delta_total),
            delta_str=_pct_str(_price_delta_total, prev_total),
            delta_color=_dc(_price_delta_total),
        )
        _kpi(
            m4,
            "Net Invested",
            f"{_invest_delta_total:+,.0f} €",
            value_color=_dc(_invest_delta_total),
            delta_str=_pct_str(_invest_delta_total, prev_total),
            delta_color=_dc(_invest_delta_total),
        )
    else:
        _kpi(m3, "Price Delta", "—")
        _kpi(m4, "Net Invested", "—")

    # ── Performance KPIs (Price Return / IRR / TWR) ───────────────────────────
    st.markdown("<div style='margin-top:1.5rem'></div>", unsafe_allow_html=True)

    _perf = compute_performance_metrics(all_dates, df_all, _tx_all, selected_date)
    _perf_prev = (
        compute_performance_metrics(all_dates, df_all, _tx_all, prev_date)
        if prev_date is not None
        else {}
    )

    _PERF_META = {
        "price_return": dict(
            label="Total Price Return",
            fmt=lambda v: f"{v * 100:.1f}%",
            subtitle=(
                "Total gain from price movements on all capital deployed — "
                "not annualised. High here means markets worked in your favour, "
                "independent of when you invested."
            ),
        ),
        "irr": dict(
            label="IRR (XIRR)",
            fmt=lambda v: f"{v * 100:.1f}% p.a.",
            subtitle=(
                "Your actual annualised return, accounting for when every euro "
                "was invested or received. This is what your money truly earned. "
                "Higher than TWR → you timed contributions well."
            ),
        ),
        "twr": dict(
            label="TWR",
            fmt=lambda v: f"{v * 100:.1f}% p.a.",
            subtitle=(
                "Annualised return stripped of cash flow timing — the fund-manager "
                "standard. Use this to compare fairly against a benchmark like the "
                "S&P 500. Lower than IRR → your timing added alpha."
            ),
        ),
    }

    p1, p2, p3, p4 = st.columns(4)
    for _col, _key in zip([p1, p2, p3], ["price_return", "irr", "twr"]):
        _meta = _PERF_META[_key]
        _val = _perf.get(_key)
        _prev_val = _perf_prev.get(_key)
        if _val is None:
            _kpi(_col, _meta["label"], "—", subtitle=_meta["subtitle"])
        else:
            _d_val = _val - _prev_val if _prev_val is not None else None
            _kpi(
                _col,
                _meta["label"],
                _meta["fmt"](_val),
                subtitle=_meta["subtitle"],
                delta_str=(f"{_d_val * 100:+.1f}pp" if _d_val is not None else None),
                delta_color=(_dc(_d_val) if _d_val is not None else None),
            )
    # ── Dividend Yield (trailing 12 months) ──────────────────────────────────
    _div_cutoff = pd.Timestamp(selected_date) - pd.DateOffset(months=12)
    _divs_ttm = _tx_all[
        (_tx_all["direction"].isin(["dividend", "interest"]))
        & (_tx_all["date"] > _div_cutoff)
        & (_tx_all["date"] <= pd.Timestamp(selected_date))
    ]["amount_eur"].sum()
    _div_yield = _divs_ttm / total_value if total_value > 0 else None

    _div_yield_prev = None
    if prev_date is not None and prev_total and prev_total > 0:
        _div_cutoff_prev = pd.Timestamp(prev_date) - pd.DateOffset(months=12)
        _divs_ttm_prev = _tx_all[
            (_tx_all["direction"].isin(["dividend", "interest"]))
            & (_tx_all["date"] > _div_cutoff_prev)
            & (_tx_all["date"] <= pd.Timestamp(prev_date))
        ]["amount_eur"].sum()
        _div_yield_prev = _divs_ttm_prev / prev_total

    _dy_delta = (
        _div_yield - _div_yield_prev
        if (_div_yield is not None and _div_yield_prev is not None)
        else None
    )
    _kpi(
        p4,
        "Dividend Yield",
        f"{_div_yield * 100:.2f}%" if _div_yield is not None else "—",
        delta_str=(f"{_dy_delta * 100:+.2f}pp" if _dy_delta is not None else None),
        delta_color=(_dc(_dy_delta) if _dy_delta is not None else None),
        subtitle=(
            "Dividends + interest received in the trailing 12 months "
            "as a % of current portfolio value."
        ),
    )

    # Avg holding period (FIFO-based, scoped to selected statement date)
    _hp_curr_px: dict = {}
    for _, _r in df_sel.iterrows():
        if pd.notna(_r.get("shares")) and _r["shares"] > 0:
            _hp_curr_px[_r["isin"]] = _r["market_value_eur"] / _r["shares"]
    _hp_tx = _tx_all[_tx_all["date"] <= pd.Timestamp(selected_date)]
    _hp_lots = compute_fifo_lots(_hp_tx, _hp_curr_px)
    _hp = compute_holding_periods(_hp_lots, today=pd.Timestamp(selected_date))
    st.divider()

    # ── Over time (only with multiple statements) ─────────────────────────────

    if len(all_dates) > 1:
        # Total Portfolio Value
        st.subheader("Total Portfolio Value Over Time")
        _tv = df_totals["total_value"]
        _tv_max = _tv.max()
        _bm_tx_max = max((v for v in (_bm_tx_values or []) if v), default=0)
        _x_dates = list(df_totals["statement_date"])
        _x_pad = pd.Timedelta(days=10)
        fig = go.Figure(
            go.Bar(
                x=_x_dates,
                y=_tv,
                name="Portfolio (EUR)",
                marker_color=ACCENT,
                hovertemplate="%{x|%Y-%m-%d}<br><b>€%{y:,.0f}</b><extra></extra>",
                showlegend=True,
            )
        )
        fig.update_layout(
            **_layout(
                height=320,
                margin=MARGIN_WIDE,
                showlegend=True,
                yaxis=dict(
                    rangemode="tozero", range=[0, max(_tv_max, _bm_tx_max) * 1.2]
                ),
                xaxis=dict(
                    tickmode="linear",
                    dtick="M1",
                    tickformat="%b %y",
                    range=[
                        pd.Timestamp(_x_dates[0]) - _x_pad,
                        pd.Timestamp(_x_dates[-1]) + _x_pad,
                    ],
                ),
                legend=dict(
                    orientation="h",
                    x=0,
                    y=-0.22,
                    xanchor="left",
                    font=dict(size=11, color=TEXT),
                    bgcolor="rgba(0,0,0,0)",
                ),
            )
        )
        _tv_list = list(df_totals["total_value"])
        if _bm_tx_values and any(v is not None for v in _bm_tx_values):
            # Build per-point hover data: [gap_vs_portfolio, mom_pct]
            _bm_customdata = []
            for i in range(len(_bm_tx_values)):
                bm_v = _bm_tx_values[i]
                # Gap vs portfolio
                if bm_v:
                    _diff = (_tv_list[i] - bm_v) / bm_v * 100
                    _gap = (
                        f"Portfolio +{_diff:.2f}% vs benchmark"
                        if _diff >= 0
                        else f"Portfolio {_diff:.2f}% vs benchmark"
                    )
                else:
                    _gap = ""
                # Month-over-month benchmark % change
                if i > 0 and bm_v and _bm_tx_values[i - 1]:
                    _mom = (bm_v - _bm_tx_values[i - 1]) / _bm_tx_values[i - 1] * 100
                    _mom_str = f"+{_mom:.2f}% MoM" if _mom >= 0 else f"{_mom:.2f}% MoM"
                else:
                    _mom_str = "—"
                _bm_customdata.append([_gap, _mom_str])

            _bm_label = _bm_cfg["label"]
            _bm_short = _bm_name  # e.g. "S&P 500"
            fig.add_trace(
                go.Scatter(
                    x=list(df_totals["statement_date"]),
                    y=_bm_tx_values,
                    name=_bm_label,
                    customdata=_bm_customdata,
                    mode="lines+markers+text",
                    text=[""] * (len(_bm_tx_values) - 1)
                    + [f"{_bm_short}  {_bm_tx_values[-1]:,.0f}"],
                    textposition="middle right",
                    textfont=dict(color=POSITIVE, size=10),
                    cliponaxis=False,
                    line=dict(color=POSITIVE, width=2, dash="dot"),
                    marker=dict(size=4, color=POSITIVE),
                    hovertemplate=(
                        f"{_bm_label}<br>"
                        "%{x|%b %Y}<br>"
                        "<b>€%{y:,.0f}</b><br>"
                        "%{customdata[0]}<br>"
                        "%{customdata[1]}"
                        "<extra></extra>"
                    ),
                    showlegend=True,
                )
            )

        # USD value line
        try:
            _usd_values = []
            _usd_rates = []
            for _d in df_totals["statement_date"]:
                _rate = _sp_raw["eurusd"].asof(_d)
                _eur = df_totals.loc[
                    df_totals["statement_date"] == _d, "total_value"
                ].iloc[0]
                _usd_values.append(round(_eur * _rate, 2) if pd.notna(_rate) else None)
                _usd_rates.append(round(_rate, 4) if pd.notna(_rate) else None)
            _usd_max = max((v for v in _usd_values if v), default=0)
            if _usd_max > 0:
                fig.update_layout(
                    yaxis=dict(range=[0, max(_tv_max, _bm_tx_max, _usd_max) * 1.2])
                )
                _usd_labels = [""] * len(_usd_values)
                _usd_labels[-1] = f"USD  {_usd_values[-1]:,.0f}"
                fig.add_trace(
                    go.Scatter(
                        x=list(df_totals["statement_date"]),
                        y=_usd_values,
                        name="Portfolio (USD)",
                        customdata=_usd_rates,
                        mode="lines+markers+text",
                        text=_usd_labels,
                        textposition="middle right",
                        textfont=dict(color=COLORS[2], size=10),
                        cliponaxis=False,
                        line=dict(color=COLORS[2], width=2, dash="dash"),
                        marker=dict(size=4, color=COLORS[2]),
                        hovertemplate="Portfolio (USD)<br>%{x|%b %Y}<br><b>$%{y:,.0f}</b><br>EUR/USD %{customdata:.4f}<extra></extra>",
                        showlegend=True,
                    )
                )
        except Exception:
            pass

        # MoM growth rate — secondary y-axis
        _mom = [None] + [
            round((_tv_list[i] - _tv_list[i - 1]) / _tv_list[i - 1] * 100, 2)
            for i in range(1, len(_tv_list))
        ]
        _mom_max = max((abs(v) for v in _mom if v is not None), default=5)
        fig.add_trace(
            go.Scatter(
                x=_x_dates,
                y=_mom,
                name="MoM Growth %",
                mode="lines+markers",
                line=dict(color=MUTED, width=1.5),
                marker=dict(size=4, color=MUTED),
                yaxis="y2",
                hovertemplate="%{x|%b %Y}<br><b>%{y:+.2f}%</b><extra></extra>",
                showlegend=True,
            )
        )
        fig.update_layout(
            yaxis2=dict(
                overlaying="y",
                side="right",
                ticksuffix="%",
                tickfont=dict(color=MUTED, size=10),
                range=[-_mom_max * 2.5, _mom_max * 2.5],
                showgrid=False,
                zeroline=True,
                zerolinecolor=BORDER,
                zerolinewidth=1,
            )
        )

        _vline(fig, selected_date)
        st.plotly_chart(fig, use_container_width=True, config={"scrollZoom": False})


    # ── Allocation charts ─────────────────────────────────────────────────────

    st.subheader("Portfolio Allocation")

    df_sorted = df_sel.sort_values("market_value_eur", ascending=False)
    names = df_sorted["name"].tolist()
    values = df_sorted["market_value_eur"].tolist()
    colors = [COLOR_MAP[n] for n in names]

    c_pie, c_bar = st.columns(2)

    with c_pie:
        fig = go.Figure(
            go.Pie(
                labels=names,
                values=values,
                hole=0.45,
                marker=dict(colors=colors, line=dict(color=CARD_BG, width=2)),
                textinfo="label+percent",
                textfont=dict(size=11, color="white"),
                hovertemplate="<b>%{label}</b><br>%{value:,.2f}<br>%{percent}<extra></extra>",
                direction="clockwise",
                sort=False,
            )
        )
        fig.update_layout(
            **_layout(
                title=dict(
                    text="Allocation by Market Value",
                    font=dict(size=CHART_TITLE_SIZE, color=TEXT),
                    x=0,
                ),
                showlegend=False,
                margin=dict(l=20, r=20, t=50, b=20),
                height=400,
            )
        )
        st.plotly_chart(fig, use_container_width=True, config={"scrollZoom": False})

    with c_bar:
        df_asc = df_sel.sort_values("market_value_eur", ascending=True)
        fig = go.Figure(
            go.Bar(
                x=df_asc["market_value_eur"],
                y=df_asc["name"],
                orientation="h",
                marker_color=[COLOR_MAP[n] for n in df_asc["name"]],
                text=[f"{v:,.0f} €" for v in df_asc["market_value_eur"]],
                textposition="outside",
                textfont=dict(color=TEXT, size=11),
                hovertemplate="<b>%{y}</b><br>%{x:,.0f} €<extra></extra>",
                showlegend=False,
            )
        )
        fig.update_layout(
            **_layout(
                title=dict(
                    text="Market Value per Position",
                    font=dict(size=CHART_TITLE_SIZE, color=TEXT),
                    x=0,
                ),
                xaxis=dict(visible=False),
                yaxis=dict(tickfont=dict(color=TEXT)),
                margin=dict(l=20, r=20, t=50, b=20),
                height=400,
                bargap=0.3,
            )
        )
        fig.update_xaxes(range=[0, df_asc["market_value_eur"].max() * 1.35])
        st.plotly_chart(fig, use_container_width=True, config={"scrollZoom": False})


    # ── Holdings table ────────────────────────────────────────────────────────

    st.divider()
    _hdr_left, _hdr_right = st.columns([6, 2])
    _hdr_left.subheader("Holdings Detail")
    _compare_on = _hdr_right.toggle(
        "Compare statements", value=False, key="compare_mode"
    )

    if _compare_on:
        _cmp_default_idx = max(0, _new_idx - 1)
        _cmp_date = st.selectbox(
            "Compare with",
            options=[d for d in all_dates if d != selected_date],
            index=min(_cmp_default_idx, len(all_dates) - 2),
            format_func=lambda d: d.strftime("%b %Y"),
            key="compare_date",
        )
        _df_a = df_all[df_all["statement_date"] == _cmp_date].set_index("isin")
        _df_b = df_sel.set_index("isin")
        _tv_a = _df_a["market_value_eur"].sum()
        _tv_b = _df_b["market_value_eur"].sum()

        _date_from = min(_cmp_date, selected_date)
        _date_to = max(_cmp_date, selected_date)

        _tx_cmp = _tx_between(_tx_all, _date_from, _date_to)
        _cmp_buys = (
            _tx_cmp[_tx_cmp["direction"] == "buy"]
            .groupby("isin")["amount_eur"]
            .apply(lambda x: x.abs().sum())
        )
        _cmp_sells = (
            _tx_cmp[_tx_cmp["direction"] == "sell"].groupby("isin")["amount_eur"].sum()
        )

        _all_isins = _df_a.index.union(_df_b.index)
        _cmp_rows = []
        for isin in _all_isins:
            in_a = isin in _df_a.index
            in_b = isin in _df_b.index
            name = _df_b.loc[isin, "name"] if in_b else _df_a.loc[isin, "name"]
            mv_a = _df_a.loc[isin, "market_value_eur"] if in_a else 0.0
            mv_b = _df_b.loc[isin, "market_value_eur"] if in_b else 0.0
            sh_a = _df_a.loc[isin, "shares"] if in_a else 0.0
            sh_b = _df_b.loc[isin, "shares"] if in_b else 0.0
            pr_a = _df_a.loc[isin, "price_eur"] if in_a else None
            pr_b = _df_b.loc[isin, "price_eur"] if in_b else None
            status = "NEW" if not in_a else ("SOLD" if not in_b else "HELD")
            _buys_i = _cmp_buys.get(isin, 0.0)
            _sells_i = _cmp_sells.get(isin, 0.0)
            _cmp_rows.append(
                {
                    "Name": name,
                    "Status": status,
                    f"Value {_cmp_date.strftime('%b %y')}": mv_a,
                    f"Value {selected_date.strftime('%b %y')}": mv_b,
                    "Value Δ": mv_b - mv_a,
                    f"Shares {_cmp_date.strftime('%b %y')}": sh_a,
                    f"Shares {selected_date.strftime('%b %y')}": sh_b,
                    "Shares Δ (€)": round(_buys_i - _sells_i, 2),
                    f"Price {_cmp_date.strftime('%b %y')}": pr_a,
                    f"Price {selected_date.strftime('%b %y')}": pr_b,
                    "Price Δ (€)": round(mv_b - mv_a - _buys_i + _sells_i, 2),
                    f"Weight {_cmp_date.strftime('%b %y')}": (
                        mv_a / _tv_a * 100 if _tv_a else 0.0
                    ),
                    f"Weight {selected_date.strftime('%b %y')}": (
                        mv_b / _tv_b * 100 if _tv_b else 0.0
                    ),
                    "Weight Δ": (mv_b / _tv_b * 100 if _tv_b else 0.0)
                    - (mv_a / _tv_a * 100 if _tv_a else 0.0),
                }
            )

        _vb_col_sort = f"Value {selected_date.strftime('%b %y')}"
        _df_cmp = pd.DataFrame(_cmp_rows).sort_values(_vb_col_sort, ascending=False)

        _va_col = f"Value {_cmp_date.strftime('%b %y')}"
        _vb_col = f"Value {selected_date.strftime('%b %y')}"
        _sa_col = f"Shares {_cmp_date.strftime('%b %y')}"
        _sb_col = f"Shares {selected_date.strftime('%b %y')}"
        _pa_col = f"Price {_cmp_date.strftime('%b %y')}"
        _pb_col = f"Price {selected_date.strftime('%b %y')}"
        _wa_col = f"Weight {_cmp_date.strftime('%b %y')}"
        _wb_col = f"Weight {selected_date.strftime('%b %y')}"

        _cmp_fmt = {
            _va_col: "{:,.0f} €",
            _vb_col: "{:,.0f} €",
            "Value Δ": "{:+,.0f} €",
            _sa_col: "{:,.4f}",
            _sb_col: "{:,.4f}",
            "Shares Δ (€)": "{:+,.0f} €",
            "Price Δ (€)": "{:+,.0f} €",
            _pa_col: "{:,.2f} €",
            _pb_col: "{:,.2f} €",
            _wa_col: "{:.1f}%",
            _wb_col: "{:.1f}%",
            "Weight Δ": "{:+.1f}%",
        }

        _cmp_delta_cols = [
            c
            for c in ["Value Δ", "Shares Δ (€)", "Price Δ (€)", "Weight Δ"]
            if c in _df_cmp.columns
        ]

        def _fmt_cmp(col, val):
            if pd.isna(val):
                return "—"
            if col in _cmp_fmt:
                try:
                    return _cmp_fmt[col].format(val)
                except (ValueError, TypeError):
                    pass
            return str(val)

        _cmp_cols = list(_df_cmp.columns)
        _cmp_hdr = "".join(f"<th>{c}</th>" for c in _cmp_cols)
        _cmp_rows_html = []
        for row in _df_cmp.to_dict("records"):
            status = row.get("Status", "")
            _rc = (
                "hd-new" if status == "NEW" else ("hd-sold" if status == "SOLD" else "")
            )
            _cells = []
            for c in _cmp_cols:
                val = row[c]
                text = _fmt_cmp(c, val)
                style = ""
                if c == "Status":
                    color = (
                        POSITIVE
                        if status == "NEW"
                        else (NEGATIVE if status == "SOLD" else MUTED)
                    )
                    style = f' style="color:{color};font-weight:{"600" if status in ("NEW","SOLD") else "400"}"'
                elif c in _cmp_delta_cols and not pd.isna(val):
                    color = MUTED if val == 0 else (POSITIVE if val > 0 else NEGATIVE)
                    style = f' style="color:{color}"'
                _cells.append(f"<td{style}>{text}</td>")
            _cmp_rows_html.append(f'<tr class="{_rc}">{"".join(_cells)}</tr>')

        st.markdown(
            f'<table class="hd-table">'
            f"<thead><tr>{_cmp_hdr}</tr></thead>"
            f'<tbody>{"".join(_cmp_rows_html)}</tbody>'
            f"</table>",
            unsafe_allow_html=True,
        )
    else:

        def _delta_color(val):
            return f"color: {MUTED}" if val == 0 else f"color: {_dc(val)}"

        df_display = (
            df_sel[["name", "isin", "shares", "price_eur", "market_value_eur"]]
            .rename(
                columns={
                    "name": "Name",
                    "isin": "ISIN",
                    "shares": "Shares",
                    "price_eur": "Price",
                    "market_value_eur": "Market Value",
                }
            )
            .copy()
        )

        df_display["Weight"] = (df_display["Market Value"] / total_value * 100).round(2)

        # Cumulative net invested per ISIN (all buys − sells up to selected_date)
        _tx_up_to = _tx_all[_tx_all["date"] <= pd.Timestamp(selected_date)]
        _cum_buys = (
            _tx_up_to[_tx_up_to["direction"] == "buy"]
            .groupby("isin")["amount_eur"]
            .apply(lambda x: x.abs().sum())
        )
        _cum_sells = (
            _tx_up_to[_tx_up_to["direction"] == "sell"]
            .groupby("isin")["amount_eur"]
            .sum()
        )
        df_display["Net Invested"] = df_display["ISIN"].map(
            lambda i: round(_cum_buys.get(i, 0.0) - _cum_sells.get(i, 0.0), 2)
        )
        df_display["All-time Perf"] = (
            df_display["Market Value"] - df_display["Net Invested"]
        ).round(2)

        if df_prev is not None:
            _pi = df_prev.set_index("isin")[["market_value_eur"]].rename(
                columns={"market_value_eur": "mv_prev"}
            )
            _p = df_display.join(_pi, on="ISIN", how="left")
            df_display["Change"] = (_p["Market Value"] - _p["mv_prev"].fillna(0)).round(
                2
            )
            _prev_w = _pi["mv_prev"] / _pi["mv_prev"].sum() * 100
            df_display["Weight Delta"] = (
                df_display["Weight"] - df_display["ISIN"].map(_prev_w).fillna(0)
            ).round(2)
            # Tx-based per-ISIN price and shares delta
            _norm_buys = (
                _tx_sel[_tx_sel["direction"] == "buy"]
                .groupby("isin")["amount_eur"]
                .apply(lambda x: x.abs().sum())
            )
            _norm_sells = (
                _tx_sel[_tx_sel["direction"] == "sell"]
                .groupby("isin")["amount_eur"]
                .sum()
            )
            df_display["Shares Delta"] = df_display["ISIN"].map(
                lambda i: round(_norm_buys.get(i, 0.0) - _norm_sells.get(i, 0.0), 2)
            )
            df_display["Price Delta"] = (
                df_display["Change"] - df_display["Shares Delta"]
            ).round(2)

        df_display = df_display.sort_values("Market Value", ascending=False)

        # Load persisted targets into session state once
        if "targets" not in st.session_state:
            st.session_state.targets = db.load_targets()

        df_display["Target Weight"] = df_display["ISIN"].map(
            lambda isin: st.session_state.targets.get(isin, 0.0)
        )
        df_display["Target Value"] = (
            df_display["Target Weight"] / 100 * total_value
        ).round(2)
        df_display["Diff to Target"] = (
            df_display["Weight"] - df_display["Target Weight"]
        ).round(2)

        # Holding period per position (from FIFO lots already computed above)
        df_display["Holding (m)"] = df_display["ISIN"].map(
            lambda i: (
                round(_hp.per_isin.get(i, 0) / 30.44, 1) if i in _hp.per_isin else None
            )
        )

        _DELTA_COLS = [
            c
            for c in [
                "All-time Perf",
                "Change",
                "Price Delta",
                "Shares Delta",
                "Diff to Target",
                "Weight Delta",
            ]
            if c in df_display.columns
        ]

        _col_order = [
            "Name",
            "Shares",
            "Price",
            "Market Value",
            "Net Invested",
            "All-time Perf",
            "Change",
            "Price Delta",
            "Shares Delta",
            "Weight",
            "Weight Delta",
            "Target Weight",
            "Diff to Target",
            "Target Value",
            "Holding (m)",
        ]
        _visible_cols = [c for c in _col_order if c in df_display.columns]

        _fmt = {
            "Shares": "{:,.1f}",
            "Price": "{:,.0f} €",
            "Market Value": "{:,.0f} €",
            "Net Invested": "{:,.0f} €",
            "All-time Perf": "{:+,.0f} €",
            "Weight": "{:.1f}%",
            "Weight Delta": "{:+.1f}%",
            "Target Weight": "{:.1f}%",
            "Target Value": "{:,.0f} €",
            "Diff to Target": "{:+.1f}%",
            "Holding (m)": "{:.1f}",
        }
        for _c in ["Change", "Price Delta", "Shares Delta"]:
            _fmt[_c] = "{:+,.0f} €"

        _df_view = df_display[_visible_cols].reset_index(drop=True)

        _SUM_COLS = [
            c
            for c in [
                "Market Value",
                "Net Invested",
                "All-time Perf",
                "Change",
                "Price Delta",
                "Shares Delta",
                "Weight",
            ]
            if c in _df_view.columns
        ]
        _total_row = {c: float("nan") for c in _df_view.columns}
        _total_row["Name"] = "Total"
        for c in _SUM_COLS:
            _total_row[c] = _df_view[c].sum()
        if "Holding (m)" in _df_view.columns:
            _total_row["Holding (m)"] = round(_hp.portfolio_avg_days / 30.44, 1)
        _df_view = pd.concat([_df_view, pd.DataFrame([_total_row])], ignore_index=True)

        def _fmt_cell(col, val):
            if pd.isna(val):
                return ""
            if col in _fmt:
                try:
                    return _fmt[col].format(val)
                except (ValueError, TypeError):
                    pass
            return str(val)

        _hd_cols = list(_df_view.columns)
        _hd_hdr = "".join(f"<th>{c}</th>" for c in _hd_cols)
        _hd_rows = []
        _last_idx = len(_df_view) - 1
        for i, row in enumerate(_df_view.to_dict("records")):
            _rc = "hd-total" if i == _last_idx else ""
            _cells = []
            for c in _hd_cols:
                val = row[c]
                text = _fmt_cell(c, val)
                style = ""
                if c in _DELTA_COLS and not pd.isna(val):
                    color = MUTED if val == 0 else (POSITIVE if val > 0 else NEGATIVE)
                    style = f' style="color:{color}"'
                _cells.append(f"<td{style}>{text}</td>")
            _hd_rows.append(f'<tr class="{_rc}">{"".join(_cells)}</tr>')

        st.markdown(
            f'<table class="hd-table">'
            f"<thead><tr>{_hd_hdr}</tr></thead>"
            f'<tbody>{"".join(_hd_rows)}</tbody>'
            f"</table>",
            unsafe_allow_html=True,
        )

        # ── Position chips + inline drill-down panel ──────────────────────
        _chip_names = (
            df_display.sort_values("Market Value", ascending=False)["Name"]
            .dropna().tolist()
        )
        _picked = st.pills(
            "Drill into position",
            options=_chip_names,
            selection_mode="single",
            default=None,
            key="pos_drill_pills",
            label_visibility="collapsed",
        )
        if _picked:
            _drill_isin_rows = df_sel[df_sel["name"] == _picked]["isin"]
            if not _drill_isin_rows.empty:
                _render_position_panel(_drill_isin_rows.iloc[0])

        # Target allocations moved to Settings tab



def _render_performance_tab():
    if len(all_dates) < 2:
        st.info("Load at least 2 statements to view performance analytics.")
        return

    # ── IRR / TWR over time ───────────────────────────────────────────────
    st.subheader("IRR vs TWR Over Time")
    _perf_ser = compute_performance_series(tuple(all_dates), df_all, _tx_all)
    _ps_dates = list(_perf_ser["date"])
    _ps_irr = list(_perf_ser["irr"])
    _ps_twr = list(_perf_ser["twr"])

    # Benchmark annualised return (simple, no cash flows) — comparable to TWR
    _ps_bm: list = []
    if _bm_raw is not None:
        _pc = "index_eur"
        _first_px = _bm_raw[_pc].asof(pd.Timestamp(_ps_dates[0]))
        for _d in _ps_dates:
            _px = _bm_raw[_pc].asof(pd.Timestamp(_d))
            _yrs = (_d - _ps_dates[0]).days / 365.25
            if _yrs > 0 and pd.notna(_px) and pd.notna(_first_px) and _first_px > 0:
                _ps_bm.append((_px / _first_px) ** (1 / _yrs) - 1)
            else:
                _ps_bm.append(None)

    _perf_fig = go.Figure()

    # ── Coloured fill between IRR and TWR ────────────────────────────────
    _GREEN_F = "rgba(34,197,94,0.18)"
    _RED_F = "rgba(239,68,68,0.18)"
    for _i in range(len(_ps_dates) - 1):
        _a0, _a1 = _ps_irr[_i], _ps_irr[_i + 1]  # IRR
        _b0, _b1 = _ps_twr[_i], _ps_twr[_i + 1]  # TWR
        if any(v is None for v in [_a0, _a1, _b0, _b1]):
            continue
        # Convert to percentage scale to match the plotted lines
        _a0, _a1, _b0, _b1 = _a0 * 100, _a1 * 100, _b0 * 100, _b1 * 100
        _x0 = pd.Timestamp(_ps_dates[_i])
        _x1 = pd.Timestamp(_ps_dates[_i + 1])
        _d0, _d1 = _a0 - _b0, _a1 - _b1  # IRR − TWR (in %)

        if _d0 * _d1 >= 0:
            # No crossover in this segment
            _fc = _GREEN_F if _d0 >= 0 else _RED_F
            _perf_fig.add_trace(
                go.Scatter(
                    x=[_x0, _x1, _x1, _x0],
                    y=[_a0, _a1, _b1, _b0],
                    fill="toself",
                    fillcolor=_fc,
                    line=dict(width=0),
                    mode="lines",
                    showlegend=False,
                    hoverinfo="skip",
                )
            )
        else:
            # Crossover: split into two triangles
            _t = _d0 / (_d0 - _d1)
            _x_c = _x0 + (_x1 - _x0) * _t
            _v_c = _a0 + (_a1 - _a0) * _t
            _fc1 = _GREEN_F if _d0 >= 0 else _RED_F
            _fc2 = _GREEN_F if _d1 >= 0 else _RED_F
            _perf_fig.add_trace(
                go.Scatter(
                    x=[_x0, _x_c, _x0],
                    y=[_a0, _v_c, _b0],
                    fill="toself",
                    fillcolor=_fc1,
                    line=dict(width=0),
                    mode="lines",
                    showlegend=False,
                    hoverinfo="skip",
                )
            )
            _perf_fig.add_trace(
                go.Scatter(
                    x=[_x_c, _x1, _x1, _x_c],
                    y=[_v_c, _a1, _b1, _v_c],
                    fill="toself",
                    fillcolor=_fc2,
                    line=dict(width=0),
                    mode="lines",
                    showlegend=False,
                    hoverinfo="skip",
                )
            )

    # ── IRR line ─────────────────────────────────────────────────────────
    _irr_labels = [""] * len(_ps_irr)
    _last_irr = next((v for v in reversed(_ps_irr) if v is not None), None)
    if _last_irr is not None:
        _irr_labels[-1] = f"IRR  {_last_irr * 100:.1f}%"
    _perf_fig.add_trace(
        go.Scatter(
            x=_ps_dates,
            y=[v * 100 if v is not None else None for v in _ps_irr],
            name="IRR",
            mode="lines+markers+text",
            text=_irr_labels,
            textposition="middle right",
            textfont=dict(color=ACCENT, size=10),
            cliponaxis=False,
            line=dict(color=ACCENT, width=2),
            marker=dict(size=5, color=ACCENT),
            hovertemplate="%{x|%b %Y}<br><b>IRR %{y:.1f}% p.a.</b><extra></extra>",
        )
    )

    # ── TWR line ─────────────────────────────────────────────────────────
    _twr_labels = [""] * len(_ps_twr)
    _last_twr = next((v for v in reversed(_ps_twr) if v is not None), None)
    if _last_twr is not None:
        _twr_labels[-1] = f"TWR  {_last_twr * 100:.1f}%"
    _perf_fig.add_trace(
        go.Scatter(
            x=_ps_dates,
            y=[v * 100 if v is not None else None for v in _ps_twr],
            name="TWR",
            mode="lines+markers+text",
            text=_twr_labels,
            textposition="middle right",
            textfont=dict(color=COLORS[2], size=10),
            cliponaxis=False,
            line=dict(color=COLORS[2], width=2),
            marker=dict(size=5, color=COLORS[2]),
            hovertemplate="%{x|%b %Y}<br><b>TWR %{y:.1f}% p.a.</b><extra></extra>",
        )
    )

    # ── Benchmark annualised return line ──────────────────────────────────
    if _ps_bm and any(v is not None for v in _ps_bm):
        _bm_labels = [""] * len(_ps_bm)
        _last_bm = next((v for v in reversed(_ps_bm) if v is not None), None)
        if _last_bm is not None:
            _bm_labels[-1] = f"{_bm_name}  {_last_bm * 100:.1f}%"
        _perf_fig.add_trace(
            go.Scatter(
                x=_ps_dates,
                y=[v * 100 if v is not None else None for v in _ps_bm],
                name=f"{_bm_name} (ann.)",
                mode="lines+markers+text",
                text=_bm_labels,
                textposition="middle right",
                textfont=dict(color=POSITIVE, size=10),
                cliponaxis=False,
                line=dict(color=POSITIVE, width=2, dash="dot"),
                marker=dict(size=4, color=POSITIVE),
                hovertemplate=f"{_bm_name}<br>%{{x|%b %Y}}<br><b>%{{y:.1f}}% p.a.</b><extra></extra>",
            )
        )

    _all_perf_vals = [v * 100 for v in _ps_irr + _ps_twr + _ps_bm if v is not None]
    _perf_y_max = max(_all_perf_vals) * 1.3 if _all_perf_vals else 50
    _perf_y_min = min(_all_perf_vals) * 1.3 if _all_perf_vals else -10
    _perf_fig.update_layout(
        **_layout(
            height=300,
            margin=MARGIN_WIDE,
            showlegend=True,
            yaxis=dict(
                ticksuffix="% p.a.",
                zeroline=True,
                zerolinecolor=BORDER,
                zerolinewidth=1,
                range=[_perf_y_min, _perf_y_max],
            ),
            xaxis=dict(
                tickmode="linear",
                dtick="M1",
                tickformat="%b %y",
                range=[
                    pd.Timestamp(_ps_dates[0]) - pd.Timedelta(days=15),
                    pd.Timestamp(_ps_dates[-1]) + pd.Timedelta(days=20),
                ],
            ),
            legend=dict(
                orientation="h",
                x=0,
                y=-0.22,
                xanchor="left",
                font=dict(size=11, color=TEXT),
                bgcolor="rgba(0,0,0,0)",
            ),
        )
    )
    _vline(_perf_fig, selected_date)
    st.plotly_chart(
        _perf_fig, use_container_width=True, config={"scrollZoom": False}
    )

    # Shared x-axis range for the 4 position/holding-period charts
    _x_dates = pd.Series(list(all_dates))
    _x_shared = [
        _x_dates.min() - pd.Timedelta(days=15),
        _x_dates.max() + pd.Timedelta(days=20),
    ]

    # Row 1: Positions + Avg Size
    c_pos, c_avg = st.columns(2)

    with c_pos:
        _pos = df_totals["positions"]
        fig = _line_chart(
            df_totals["statement_date"],
            _pos,
            POSITIVE,
            title="Total Positions Over Time",
            height=260,
            margin=MARGIN_WIDE,
            dtick=1,
            end_label=str(int(_pos.iloc[-1])),
            xaxis_range=_x_shared,
        )
        _vline(fig, selected_date)
        st.plotly_chart(fig, use_container_width=True, config={"scrollZoom": False})

    with c_avg:
        _avg = df_totals["avg_size"]
        fig = _line_chart(
            df_totals["statement_date"],
            _avg,
            COLORS[2],
            title="Avg Position Size Over Time",
            height=260,
            margin=MARGIN_WIDE,
            xaxis_range=_x_shared,
        )
        _vline(fig, selected_date)
        st.plotly_chart(fig, use_container_width=True, config={"scrollZoom": False})

    # Compute holding period at each statement date (portfolio + per company)
    _hold_months, _hold_per_co = compute_holding_period_series(
        df_all, _tx_all, tuple(all_dates)
    )

    # Row 2: Avg Holding Period (portfolio) + Holding Period by Company
    c_hold, c_hold_co = st.columns(2)

    with c_hold:
        fig = _line_chart(
            df_totals["statement_date"],
            pd.Series(_hold_months),
            ACCENT,
            title="Avg Holding Period",
            height=260,
            margin=MARGIN_WIDE,
            end_label=f"{_hold_months[-1]:.1f}m",
            xaxis_range=_x_shared,
        )
        _vline(fig, selected_date)
        st.plotly_chart(fig, use_container_width=True, config={"scrollZoom": False})

    with c_hold_co:
        _hco_fig = go.Figure()
        _sorted_co = sorted(
            _hold_per_co.items(),
            key=lambda kv: kv[1][-1] if kv[1][-1] is not None else 0,
            reverse=True,
        )
        for _nm, _vals in _sorted_co:
            _clr = COLOR_MAP.get(_nm, MUTED)
            _end_v = _vals[-1] if _vals[-1] is not None else 0
            _lbl = [""] * len(_vals)
            _lbl[-1] = f"{_nm}  {_end_v:.1f}m"
            _hco_fig.add_trace(
                go.Scatter(
                    x=list(all_dates),
                    y=_vals,
                    name=_nm,
                    mode="lines+markers+text",
                    text=_lbl,
                    textposition="middle right",
                    textfont=dict(color=_clr, size=10),
                    cliponaxis=False,
                    line=dict(color=_clr, width=2),
                    marker=dict(size=4, color=_clr),
                    connectgaps=False,
                    hovertemplate=f"{_nm}<br>%{{x|%b %Y}}<br><b>%{{y:.1f}} months</b><extra></extra>",
                )
            )
        _hco_fig.update_layout(
            **_layout(
                title=dict(
                    text="Holding Period by Company",
                    font=dict(size=CHART_TITLE_SIZE, color=TEXT),
                    x=0,
                ),
                height=260,
                margin=MARGIN_WIDE,
                showlegend=False,
                yaxis=dict(tickformat=".0f", ticksuffix="m", zeroline=False),
            )
        )
        _hco_fig.update_xaxes(
            tickmode="linear",
            dtick="M1",
            tickformat="%b %y",
            range=_x_shared,
        )
        _vline(_hco_fig, selected_date)
        st.plotly_chart(
            _hco_fig, use_container_width=True, config={"scrollZoom": False}
        )

    # ── Portfolio value change decomposition ──────────────────────────────

    st.divider()
    st.subheader("Portfolio Value Change Decomposition")

    def _breakdown_hover(label, total, effects: dict) -> str:
        """Top-3 contributors + 'Other' remainder for bar hover tooltips."""
        top = sorted(effects.items(), key=lambda x: abs(x[1]), reverse=True)
        shown, rest = top[:3], top[3:]
        lines = [f"<b>{label}: {total:+,.0f} €</b>"]
        for name, val in shown:
            lines.append(f"{name}: {val:+,.0f} €")
        if rest:
            other = total - sum(v for _, v in shown)
            lines.append(f"Other: {other:+,.0f} €")
        return "<br>".join(lines)

    _p_periods, _p_price_eff, _p_invest_eff, _p_values = [], [], [], []
    _p_price_hover, _p_invest_hover = [], []
    _pos_pe_series: dict = {}  # {company_name: [per-period price effect]}

    # First statement — full value is initial investment, no price effect
    _d0 = df_totals["statement_date"].iloc[0]
    _first_df = df_all[df_all["statement_date"] == _d0]
    _first_val = df_totals["total_value"].iloc[0]
    _first_effects = dict(zip(_first_df["name"], _first_df["market_value_eur"]))
    _p_periods.append(_d0.strftime("%b %Y"))
    _p_price_eff.append(0.0)
    _p_invest_eff.append(_first_val)
    _p_values.append(_first_val)
    # Seed all known companies with 0 for the first period
    for _nm in _first_effects:
        _pos_pe_series.setdefault(_nm, []).append(0.0)
    _p_price_hover.append("<b>No prior period</b>")
    _p_invest_hover.append(
        _breakdown_hover("Net invested", _first_val, _first_effects)
    )

    for _i in range(1, len(df_totals)):
        _d_prev = df_totals["statement_date"].iloc[_i - 1]
        _d_curr = df_totals["statement_date"].iloc[_i]
        _prev_df = df_all[df_all["statement_date"] == _d_prev].set_index("isin")
        _curr_df = df_all[df_all["statement_date"] == _d_curr].set_index("isin")
        _name_map_p = _curr_df["name"].combine_first(_prev_df["name"]).to_dict()

        # Tx-based per-period and per-position effects
        _tx_p = _tx_between(_tx_all, _d_prev, _d_curr)
        _buys_p_isin = (
            _tx_p[_tx_p["direction"] == "buy"]
            .groupby("isin")["amount_eur"]
            .apply(lambda x: x.abs().sum())
        )
        _sells_p_isin = (
            _tx_p[_tx_p["direction"] == "sell"].groupby("isin")["amount_eur"].sum()
        )
        _buys_p = _buys_p_isin.sum()
        _sells_p = _sells_p_isin.sum()

        _pe_named, _ie_named = {}, {}
        for _isin in _prev_df.index.union(_curr_df.index):
            _v_curr = (
                _curr_df.loc[_isin, "market_value_eur"]
                if _isin in _curr_df.index
                else 0.0
            )
            _v_prev = (
                _prev_df.loc[_isin, "market_value_eur"]
                if _isin in _prev_df.index
                else 0.0
            )
            _b_i = _buys_p_isin.get(_isin, 0.0)
            _s_i = _sells_p_isin.get(_isin, 0.0)
            _n = _name_map_p.get(_isin, _isin)
            _pe_named[_n] = round(_v_curr - _v_prev - _b_i + _s_i, 2)
            _ie_named[_n] = round(_b_i - _s_i, 2)

        _pe_total = round(sum(_pe_named.values()), 2)
        _ie_total = round(sum(_ie_named.values()), 2)

        # Accumulate per-company price effects (0 for companies not present)
        _all_names_p = set(_pos_pe_series) | set(_pe_named)
        for _nm in _all_names_p:
            _pos_pe_series.setdefault(_nm, [0.0] * _i).append(
                _pe_named.get(_nm, 0.0)
            )

        _label = f"{_d_prev.strftime('%b %y')} → {_d_curr.strftime('%b %y')}"
        _p_periods.append(_label)
        _p_price_eff.append(_pe_total)
        _p_invest_eff.append(_ie_total)
        _p_values.append(df_totals["total_value"].iloc[_i])
        _p_price_hover.append(
            _breakdown_hover("Price effect", _pe_total, _pe_named)
        )
        _p_invest_hover.append(
            _breakdown_hover("Net invested", _ie_total, _ie_named)
        )

    _p_fig = go.Figure()
    _p_val_labels = [""] * len(_p_values)
    _p_val_labels[-1] = f"{_p_values[-1]:,.0f} €"
    _p_fig.add_trace(
        go.Scatter(
            x=_p_periods,
            y=_p_values,
            name="Total value",
            mode="lines+markers+text",
            text=_p_val_labels,
            textposition="middle right",
            textfont=dict(color=TEXT, size=10),
            cliponaxis=False,
            line=dict(color=TEXT, width=2, dash="dot"),
            marker=dict(size=5),
            hovertemplate="%{x}<br>Total value: <b>%{y:,.0f} €</b><extra></extra>",
        )
    )
    _p_fig.add_trace(
        go.Bar(
            x=_p_periods,
            y=_p_price_eff,
            name="Price effect",
            marker_color=[POSITIVE if v >= 0 else NEGATIVE for v in _p_price_eff],
            yaxis="y2",
            hovertext=_p_price_hover,
            hovertemplate="%{hovertext}<extra></extra>",
        )
    )
    _p_fig.add_trace(
        go.Bar(
            x=_p_periods,
            y=_p_invest_eff,
            name="Net invested",
            marker_color=[ACCENT if v >= 0 else COLORS[2] for v in _p_invest_eff],
            yaxis="y2",
            hovertext=_p_invest_hover,
            hovertemplate="%{hovertext}<extra></extra>",
        )
    )
    if decomp_vline_x := next(
        (p for p in _p_periods if selected_date.strftime("%b %y") in p), None
    ):
        _p_fig.add_vline(
            x=decomp_vline_x, line=dict(color=MUTED, width=1, dash="dash")
        )
    _p_fig.update_layout(
        **_layout(
            barmode="relative",
            xaxis=dict(tickmode="array", tickvals=_p_periods),
            yaxis=dict(
                title=dict(text="Total value (€)", font=dict(color=MUTED)),
                range=[0, max(_p_values) * 1.3],
                showgrid=True,
            ),
            yaxis2=dict(
                overlaying="y",
                side="right",
                title=dict(text="Period change (€)", font=dict(color=MUTED)),
                tickfont=dict(color=MUTED),
                showgrid=False,
                zeroline=True,
                zerolinecolor=BORDER,
                zerolinewidth=1,
            ),
            height=480,
            margin=dict(l=60, r=80, t=40, b=120),
            legend=dict(
                bgcolor="rgba(255,255,255,0.9)",
                bordercolor=BORDER,
                font=dict(color=TEXT, size=11),
                orientation="h",
                x=0.5,
                xanchor="center",
                y=-0.22,
            ),
        )
    )
    st.plotly_chart(_p_fig, use_container_width=True, config={"scrollZoom": False})

    # ── Cumulative price & investment effect ───────────────────────────────

    _cum_dates = list(df_totals["statement_date"])
    _cum_price = list(pd.Series(_p_price_eff).cumsum())
    _cum_invest = list(pd.Series(_p_invest_eff).cumsum())

    # ── Derive cumulative price effect for each benchmark ─────────────────
    # bm_price_eff[i] = bm_value[i] - bm_value[i-1] - invest_effect[i]
    _all_bm_cum_price: dict = {}
    for _bm_n, _bm_vals in _all_bm_tx_values.items():
        _bm_per_period = []
        for _i in range(len(_bm_vals)):
            if _i == 0:
                _bm_per_period.append(0.0)
            elif _bm_vals[_i] is not None and _bm_vals[_i - 1] is not None:
                _bm_per_period.append(
                    _bm_vals[_i] - _bm_vals[_i - 1] - _p_invest_eff[_i]
                )
            else:
                _bm_per_period.append(None)
        _all_bm_cum_price[_bm_n] = list(pd.Series(_bm_per_period).cumsum())

    _c_price_col, _c_invest_col = st.columns(2)
    _cum_price_fig = cumulative_fill_chart(
        _cum_dates,
        _cum_price,
        "Cumulative Price Effect",
        POSITIVE,
        "rgba(22,163,74,0.08)",
        selected_date,
    )
    # Overlay each benchmark's cumulative price effect
    for _bm_n, _bm_cp in _all_bm_cum_price.items():
        _bm_clr = BM_COLORS.get(_bm_n, MUTED)
        _bm_labels = [""] * len(_bm_cp)
        if _bm_cp and _bm_cp[-1] is not None:
            _bm_labels[-1] = f"{_bm_cp[-1]:+,.0f} €"
        _cum_price_fig.add_trace(
            go.Scatter(
                x=list(_cum_dates),
                y=_bm_cp,
                name=_bm_n,
                mode="lines+markers+text",
                text=_bm_labels,
                textposition="middle right",
                textfont=dict(color=_bm_clr, size=10),
                cliponaxis=False,
                line=dict(color=_bm_clr, width=1.5, dash="dot"),
                marker=dict(size=4, color=_bm_clr),
                hovertemplate=f"{_bm_n}<br>%{{x|%Y-%m-%d}}<br><b>%{{y:+,.0f}} €</b><extra></extra>",
            )
        )
    # Name trace 0 (portfolio) and keep it out of the legend
    _cum_price_fig.data[0].name = "Portfolio"
    _cum_price_fig.data[0].showlegend = False
    _cum_price_fig.update_layout(showlegend=True)
    _c_price_col.plotly_chart(_cum_price_fig, use_container_width=True)
    _c_invest_col.plotly_chart(
        cumulative_fill_chart(
            _cum_dates,
            _cum_invest,
            "Cumulative Net Invested",
            ACCENT,
            "rgba(37,99,235,0.08)",
            selected_date,
        ),
        use_container_width=True,
    )

    # ── Per-company cumulative price effect ───────────────────────────────
    _pos_cum_fig = go.Figure()
    # Sort companies by absolute cumulative price effect (largest first)
    _sorted_companies = sorted(
        _pos_pe_series.items(),
        key=lambda kv: abs(sum(kv[1])),
        reverse=True,
    )
    for _nm, _pe_list in _sorted_companies:
        _cum_pe = list(pd.Series(_pe_list).cumsum())
        _clr = COLOR_MAP.get(_nm, MUTED)
        _end_label = f"{_nm}  {_cum_pe[-1]:+,.0f} €" if _cum_pe else ""
        _labels = [""] * len(_cum_pe)
        if _labels:
            _labels[-1] = _end_label
        _pos_cum_fig.add_trace(
            go.Scatter(
                x=list(_cum_dates),
                y=_cum_pe,
                name=_nm,
                mode="lines+markers+text",
                text=_labels,
                textposition="middle right",
                textfont=dict(color=_clr, size=10),
                cliponaxis=False,
                line=dict(color=_clr, width=2),
                marker=dict(size=5, color=_clr),
                hovertemplate=f"{_nm}<br>%{{x|%Y-%m-%d}}<br><b>%{{y:+,.0f}} €</b><extra></extra>",
            )
        )
    _pos_cum_fig.update_layout(
        **_layout(
            title=dict(
                text="Cumulative Price Effect by Company",
                font=dict(size=CHART_TITLE_SIZE, color=TEXT),
                x=0,
            ),
            height=340,
            margin=MARGIN_WIDE,
            showlegend=True,
            yaxis=dict(
                tickformat="+,.0f",
                zeroline=True,
                zerolinecolor=BORDER,
                zerolinewidth=1,
            ),
            legend=dict(
                orientation="v",
                x=1.02,
                y=1,
                xanchor="left",
                font=dict(size=11, color=TEXT),
                bgcolor="rgba(0,0,0,0)",
            ),
        )
    )
    _pos_cum_fig.update_xaxes(
        tickmode="array", tickvals=list(_cum_dates), tickformat="%b %y"
    )
    if selected_date is not None:
        _vline(_pos_cum_fig, selected_date)

    # ── Layout: per-company chart (left) | stock vs benchmark (right) ─────
    _name_to_isin = (
        df_all[["name", "isin"]]
        .drop_duplicates()
        .set_index("name")["isin"]
        .to_dict()
    )
    _all_names_sorted = sorted(_pos_pe_series.keys())

    # Render both charts side-by-side; stock selector lives inside the
    # right column so it never creates a top-level stHorizontalBlock that
    # could be captured by the sticky nav-bar CSS.
    _row3_left, _row3_right = st.columns(2)
    _row3_left.plotly_chart(
        _pos_cum_fig, use_container_width=True, config={"scrollZoom": False}
    )
    _sel_stock = _row3_right.selectbox(
        "Stock vs Benchmark",
        options=_all_names_sorted,
        key="stock_bm_selector",
    )
    _sel_isin = _name_to_isin.get(_sel_stock)
    _stock_clr = COLOR_MAP.get(_sel_stock, ACCENT)

    # ── Cumulative price effect: stock vs benchmark ───────────────────────
    # Stock: per-period PE is already in _pos_pe_series → cumsum
    _stock_pe_series = _pos_pe_series.get(_sel_stock, [0.0] * len(_cum_dates))
    _stock_cum_pe = list(pd.Series(_stock_pe_series).cumsum())

    # ── Per-period net invested in selected stock (for bar trace) ──────────
    # Period 0: all buys/sells up to and including the first statement date
    _inv_per_period: list[float] = []
    if _sel_isin:
        _tp0 = _tx_all[
            (_tx_all["isin"] == _sel_isin)
            & (_tx_all["direction"].isin(["buy", "sell"]))
            & (_tx_all["date"] <= pd.Timestamp(_cum_dates[0]))
        ]
        _b0 = _tp0[_tp0["direction"] == "buy"]["amount_eur"].abs().sum()
        _s0 = _tp0[_tp0["direction"] == "sell"]["amount_eur"].sum()
        _tx_based_0 = _b0 - _s0
        if _tx_based_0 > 0:
            # We have transaction history for this stock before the first snapshot
            _inv_per_period.append(_tx_based_0)
        else:
            # No pre-snapshot transactions (e.g. deleted old data) →
            # use the market value at the first statement date as initial position
            _first_snap = df_all[
                (df_all["statement_date"] == _cum_dates[0])
                & (df_all["isin"] == _sel_isin)
            ]
            _inv_per_period.append(float(_first_snap["market_value_eur"].sum()))
        for _i in range(1, len(_cum_dates)):
            _d_prev_inv = pd.Timestamp(_cum_dates[_i - 1])
            _d_curr_inv = pd.Timestamp(_cum_dates[_i])
            _tp = _tx_all[
                (_tx_all["isin"] == _sel_isin)
                & (_tx_all["direction"].isin(["buy", "sell"]))
                & (_tx_all["date"] > _d_prev_inv)
                & (_tx_all["date"] <= _d_curr_inv)
            ]
            _b = _tp[_tp["direction"] == "buy"]["amount_eur"].abs().sum()
            _s = _tp[_tp["direction"] == "sell"]["amount_eur"].sum()
            _inv_per_period.append(_b - _s)  # >0 = buy, <0 = sell
    else:
        _inv_per_period = [0.0] * len(_cum_dates)

    _max_inv = max((abs(v) for v in _inv_per_period), default=1) or 1
    # y2 range: 0 sits ~12 % from the bottom → bars stay small and below lines
    _y2_range = [-_max_inv * 0.15, _max_inv * 7]
    _bar_colors = [
        (
            f"rgba({int(POSITIVE[1:3],16)},{int(POSITIVE[3:5],16)},{int(POSITIVE[5:7],16)},0.55)"
            if v >= 0
            else f"rgba({int(NEGATIVE[1:3],16)},{int(NEGATIVE[3:5],16)},{int(NEGATIVE[5:7],16)},0.55)"
        )
        for v in _inv_per_period
    ]

    _sbm_fig = go.Figure()
    # ── Investment bars (secondary y-axis, anchored at bottom) ─────────────
    _sbm_fig.add_trace(
        go.Bar(
            x=list(_cum_dates),
            y=_inv_per_period,
            name="Invested",
            yaxis="y2",
            marker=dict(color=_bar_colors),
            hovertemplate=(
                "Invested<br>%{x|%b %Y}<br>" "<b>%{y:+,.0f} €</b><extra></extra>"
            ),
            showlegend=True,
        )
    )
    # Stock cumulative PE line
    _s_labels = [""] * len(_stock_cum_pe)
    if _stock_cum_pe:
        _s_labels[-1] = f"{_sel_stock}  {_stock_cum_pe[-1]:+,.0f} €"
    _sbm_fig.add_trace(
        go.Scatter(
            x=list(_cum_dates),
            y=_stock_cum_pe,
            name=_sel_stock,
            mode="lines+markers+text",
            text=_s_labels,
            textposition="middle right",
            textfont=dict(color=_stock_clr, size=10),
            cliponaxis=False,
            line=dict(color=_stock_clr, width=2.5),
            marker=dict(size=5, color=_stock_clr),
            hovertemplate=(
                f"{_sel_stock}<br>%{{x|%Y-%m-%d}}<br>"
                "<b>%{y:+,.0f} €</b><extra></extra>"
            ),
        )
    )
    # Benchmark cumulative PE lines
    if _sel_isin and _all_bm_raw:
        for _bm_n, _bm_r in _all_bm_raw.items():
            _bm_cpe = compute_bm_cum_pe_for_stock(
                _sel_isin, _bm_r, df_all, _tx_all, tuple(_cum_dates)
            )
            _bm_clr = BM_COLORS.get(_bm_n, MUTED)
            _bml = [""] * len(_bm_cpe)
            _bml[-1] = f"{_bm_n}  {_bm_cpe[-1]:+,.0f} €"
            _sbm_fig.add_trace(
                go.Scatter(
                    x=list(_cum_dates),
                    y=_bm_cpe,
                    name=_bm_n,
                    mode="lines+markers+text",
                    text=_bml,
                    textposition="middle right",
                    textfont=dict(color=_bm_clr, size=10),
                    cliponaxis=False,
                    line=dict(color=_bm_clr, width=1.5, dash="dot"),
                    marker=dict(size=4, color=_bm_clr),
                    hovertemplate=(
                        f"{_bm_n}<br>%{{x|%Y-%m-%d}}<br>"
                        "<b>%{y:+,.0f} €</b><extra></extra>"
                    ),
                )
            )
    _sbm_fig.update_layout(
        **_layout(
            title=dict(
                text=f"{_sel_stock} — Cumulative Price Effect vs Benchmarks",
                font=dict(size=CHART_TITLE_SIZE, color=TEXT),
                x=0,
            ),
            height=340,
            margin=MARGIN_WIDE,
            showlegend=True,
            barmode="relative",
            yaxis=dict(
                tickformat="+,.0f",
                zeroline=True,
                zerolinecolor=BORDER,
                zerolinewidth=1,
            ),
            yaxis2=dict(
                overlaying="y",
                side="right",
                showticklabels=False,
                showgrid=False,
                zeroline=False,
                range=_y2_range,
            ),
            xaxis=dict(
                tickmode="array",
                tickvals=list(_cum_dates),
                tickformat="%b %y",
            ),
            legend=dict(
                orientation="v",
                x=1.02,
                y=1,
                xanchor="left",
                font=dict(size=11, color=TEXT),
                bgcolor="rgba(0,0,0,0)",
            ),
        )
    )
    if selected_date is not None:
        _vline(_sbm_fig, selected_date)
    _row3_right.plotly_chart(
        _sbm_fig, use_container_width=True, config={"scrollZoom": False}
    )


    # Position Values Over Time
    _pv_hdr, _pv_tog = st.columns([5, 1])
    _pv_hdr.subheader("Position Values Over Time")
    _show_weight = _pv_tog.toggle("Weight %", value=False, key="pos_weight_toggle")

    df_pivot = compute_pivot(df_all)

    if _show_weight:
        row_totals = df_pivot.sum(axis=1)
        df_pivot_plot = df_pivot.div(row_totals, axis=0) * 100
        y_fmt = "{:.1f}%"
        hover_suffix = "%"
        y_range = [0, df_pivot_plot.max().max() * 1.2]
        tick_suffix = "%"
    else:
        df_pivot_plot = df_pivot
        y_fmt = "{:,.0f}"
        hover_suffix = ""
        y_range = [0, df_pivot.max().max() * 1.2]
        tick_suffix = ""

    fig = go.Figure()
    for name in df_pivot_plot.columns:
        series = df_pivot_plot[name].dropna()
        if series.empty:
            continue
        # If position disappeared before the last statement, append one trailing zero
        all_plot_dates = df_pivot_plot.index
        if series.index[-1] < all_plot_dates[-1]:
            next_date = all_plot_dates[all_plot_dates > series.index[-1]][0]
            series = pd.concat([series, pd.Series([0.0], index=[next_date])])
        labels = [""] * len(series)
        # Label the last meaningful (non-zero exit) point
        last_val = series.iloc[-1]
        if last_val == 0.0 and len(series) > 1:
            labels[-2] = y_fmt.format(series.iloc[-2])
        else:
            labels[-1] = y_fmt.format(last_val)
        fig.add_trace(
            go.Scatter(
                x=series.index,
                y=series.values,
                mode="lines+markers+text",
                name=name,
                line=dict(color=COLOR_MAP[name], width=2),
                marker=dict(size=5),
                text=labels,
                textposition="middle right",
                textfont=dict(color=COLOR_MAP[name], size=10),
                cliponaxis=False,
                hovertemplate=f"<b>{name}</b><br>%{{x|%Y-%m-%d}}<br>%{{y:,.2f}}{hover_suffix}<extra></extra>",
            )
        )
    _vline(fig, selected_date)
    _pv_dates = df_pivot_plot.index
    _pv_pad = pd.Timedelta(days=10)
    fig.update_layout(
        **_layout(
            title=dict(
                text="Position Values Over Time",
                font=dict(size=CHART_TITLE_SIZE, color=TEXT),
                x=0,
            ),
            yaxis=dict(ticksuffix=tick_suffix, rangemode="tozero", range=y_range),
            xaxis=dict(
                tickmode="linear",
                dtick="M1",
                tickformat="%b %y",
                range=[_pv_dates.min() - _pv_pad, _pv_dates.max() + _pv_pad],
            ),
            height=460,
            margin=MARGIN_WIDE,
            legend=dict(
                bgcolor="rgba(255,255,255,0.9)",
                bordercolor=BORDER,
                font=dict(color=TEXT, size=11),
                orientation="h",
                x=0,
                y=-0.15,
                xanchor="left",
            ),
        )
    )
    st.plotly_chart(fig, use_container_width=True, config={"scrollZoom": False})

    # ── Return attribution per position ───────────────────────────────────

    st.divider()
    st.subheader("Return Attribution by Position")

    if df_prev is not None:
        _tx_sel = _tx_between(_tx_all, prev_date, selected_date)
        _prev_p = df_prev.set_index("isin")[["market_value_eur", "name"]]
        _curr_p = df_sel.set_index("isin")[["market_value_eur", "name"]]
        _all_isins = _prev_p.index.union(_curr_p.index)
        _name_map = _curr_p["name"].combine_first(_prev_p["name"])

        _buys_by_isin = (
            _tx_sel[_tx_sel["direction"] == "buy"]
            .groupby("isin")["amount_eur"]
            .apply(lambda x: x.abs().sum())
        )
        _sells_by_isin = (
            _tx_sel[_tx_sel["direction"] == "sell"]
            .groupby("isin")["amount_eur"]
            .sum()
        )
        _price_eff, _invest_eff = {}, {}
        for isin in _all_isins:
            v_curr = (
                _curr_p.loc[isin, "market_value_eur"]
                if isin in _curr_p.index
                else 0.0
            )
            v_prev = (
                _prev_p.loc[isin, "market_value_eur"]
                if isin in _prev_p.index
                else 0.0
            )
            buys = _buys_by_isin.get(isin, 0.0)
            sells = _sells_by_isin.get(isin, 0.0)
            _price_eff[isin] = round(v_curr - v_prev - buys + sells, 2)
            _invest_eff[isin] = round(buys - sells, 2)

        _attr_df = pd.DataFrame(
            {
                "name": _name_map,
                "price_effect": pd.Series(_price_eff),
                "invest_effect": pd.Series(_invest_eff),
            }
        )
        _attr_df["total"] = _attr_df["price_effect"] + _attr_df["invest_effect"]
        _attr_df = _attr_df.sort_values("total")
        _total_chg = _attr_df["total"].sum()
        _x_tot_max = _attr_df["total"].abs().max()

        _chart_h = max(320, len(_attr_df) * 38 + 80)
        _attr_col_l, _attr_col_r = st.columns(2)

        # Left: total change only
        _fig_total = go.Figure(
            go.Bar(
                x=_attr_df["total"],
                y=_attr_df["name"],
                orientation="h",
                marker_color=[
                    POSITIVE if v >= 0 else NEGATIVE for v in _attr_df["total"]
                ],
                text=[f"{v:+,.0f} €" for v in _attr_df["total"]],
                textposition="outside",
                textfont=dict(size=10, color=TEXT),
                hovertemplate="<b>%{y}</b><br>%{x:+,.0f} €<extra></extra>",
                showlegend=False,
            )
        )
        _fig_total.update_layout(
            **_layout(
                height=_chart_h,
                margin=MARGIN_COMPACT,
                xaxis=dict(
                    zeroline=True,
                    zerolinecolor=BORDER,
                    zerolinewidth=1.5,
                    tickformat="+,.0f",
                    ticksuffix=" €",
                ),
                yaxis=dict(tickfont=dict(color=TEXT)),
                title=dict(
                    text=f"Total Change by Position  <span style='font-size:11px;color:{MUTED}'>({_total_chg:+,.0f} €)</span>",
                    font=dict(size=CHART_TITLE_SIZE, color=TEXT),
                    x=0,
                ),
            )
        )
        _fig_total.update_xaxes(range=[-_x_tot_max * 1.45, _x_tot_max * 1.45])
        _attr_col_l.plotly_chart(_fig_total, use_container_width=True)

        # Right: split into price + net invested
        _fig_attr = go.Figure()
        _fig_attr.add_trace(
            go.Bar(
                x=_attr_df["price_effect"],
                y=_attr_df["name"],
                orientation="h",
                showlegend=False,
                marker_color=[
                    POSITIVE if v >= 0 else NEGATIVE
                    for v in _attr_df["price_effect"]
                ],
                hovertemplate="<b>%{y}</b><br>Price: %{x:+,.0f} €<extra></extra>",
            )
        )
        _fig_attr.add_trace(
            go.Bar(
                x=_attr_df["invest_effect"],
                y=_attr_df["name"],
                orientation="h",
                showlegend=False,
                marker_color=[
                    ACCENT if v >= 0 else COLORS[2]
                    for v in _attr_df["invest_effect"]
                ],
                hovertemplate="<b>%{y}</b><br>Net invested: %{x:+,.0f} €<extra></extra>",
                text=[f"{t:+,.0f} €" for t in _attr_df["total"]],
                textposition="outside",
                textfont=dict(size=10, color=TEXT),
            )
        )
        for _leg_name, _leg_color in [
            ("Price gain", POSITIVE),
            ("Price loss", NEGATIVE),
            ("Invested", ACCENT),
            ("Proceeds", COLORS[2]),
        ]:
            _fig_attr.add_trace(
                go.Scatter(
                    x=[None],
                    y=[None],
                    mode="markers",
                    marker=dict(color=_leg_color, symbol="square", size=10),
                    name=_leg_name,
                    showlegend=True,
                )
            )
        _fig_attr.update_layout(
            **_layout(
                barmode="relative",
                height=_chart_h,
                margin=MARGIN_COMPACT,
                xaxis=dict(
                    zeroline=True,
                    zerolinecolor=BORDER,
                    zerolinewidth=1.5,
                    tickformat="+,.0f",
                    ticksuffix=" €",
                ),
                yaxis=dict(tickfont=dict(color=TEXT), showticklabels=False),
                title=dict(
                    text="Price Effect vs. Net Invested",
                    font=dict(size=CHART_TITLE_SIZE, color=TEXT),
                    x=0,
                ),
                legend=dict(orientation="h", x=0, y=1.06, xanchor="left"),
            )
        )
        _fig_attr.update_xaxes(range=[-_x_tot_max * 1.45, _x_tot_max * 1.45])
        _attr_col_r.plotly_chart(_fig_attr, use_container_width=True)
    else:
        st.caption("No previous statement available for comparison.")

    # ── Value decomposition per stock ─────────────────────────────────────

    # Value Change Decomposition moved into position drill-down panel



def _render_activity_tab():
    # ── Buy activity heatmap (GitHub-style contribution chart) ───────────────
    st.divider()
    _buy_tx = _tx_all[
        (_tx_all["direction"] == "buy")
        & (_tx_all["date"] >= pd.Timestamp(all_dates[0]))
        & (_tx_all["date"] <= pd.Timestamp(all_dates[-1]))
    ].copy()
    if len(_buy_tx) > 0:
        _hm_start = pd.Timestamp(all_dates[0])
        _hm_end = pd.Timestamp(all_dates[-1])
        # Aggregate buy amounts per day
        _buy_tx["day"] = _buy_tx["date"].dt.normalize()
        _daily = _buy_tx.groupby("day")["amount_eur"].sum().abs()
        # Build full date range
        _all_days = pd.date_range(_hm_start, _hm_end, freq="D")
        _daily_full = _daily.reindex(_all_days, fill_value=0.0)
        # Calendar grid: x = week number, y = weekday (Mon=0 … Sun=6)
        _weeks = []
        _weekdays = []
        _amounts = []
        _dates_hm = []
        _week0 = _all_days[0].isocalendar()[1]
        _year0 = _all_days[0].year
        for _d in _all_days:
            _iso = _d.isocalendar()
            # Continuous week index from start
            _wk = (_d - _all_days[0]).days // 7
            _weeks.append(_wk)
            _weekdays.append(_d.weekday())  # 0=Mon, 6=Sun
            _amounts.append(float(_daily_full.get(_d, 0.0)))
            _dates_hm.append(_d)
        _max_amt = max(_amounts) if max(_amounts) > 0 else 1
        # Color: white (0) → ACCENT (max), with a visible step for any buy
        _colors_hm = []
        for _a in _amounts:
            if _a == 0:
                _colors_hm.append("rgba(0,0,0,0)")
            else:
                _intensity = max(0.15, min(1.0, _a / _max_amt))
                _colors_hm.append(f"rgba(37,99,235,{_intensity})")
        # Per-day breakdown by company (for hover)
        _day_detail: dict = {}
        for _day_key, _grp in _buy_tx.groupby("day"):
            _by_co = (
                _grp.groupby("name")["amount_eur"]
                .sum()
                .abs()
                .sort_values(ascending=False)
            )
            _lines = []
            for _j, (_co, _amt) in enumerate(_by_co.items()):
                if _j < 3:
                    # Use ticker if available, else truncate name
                    _tk = (
                        _all_tickers.get(_grp[_grp["name"] == _co]["isin"].iloc[0], "")
                        if "isin" in _grp.columns
                        else ""
                    )
                    _label = _tk if _tk else (_co[:18] + "…" if len(_co) > 18 else _co)
                    _lines.append(f"  {_label}  {_amt:,.0f} €")
                else:
                    _other_sum = _by_co.iloc[3:].sum()
                    _other_cnt = len(_by_co) - 3
                    _lines.append(f"  +{_other_cnt} other  {_other_sum:,.0f} €")
                    break
            _day_detail[_day_key] = "<br>".join(_lines)
        # Hover text
        _hover = []
        for _d, _a in zip(_dates_hm, _amounts):
            if _a > 0:
                _detail = _day_detail.get(_d, "")
                _hover.append(
                    f"<b>{_d.strftime('%a %d %b %Y')}</b><br>"
                    f"Total: <b>{_a:,.0f} €</b><br>{_detail}"
                )
            else:
                _hover.append(f"{_d.strftime('%a %d %b %Y')}<br>No buys")
        _hm_fig = go.Figure()
        _hm_fig.add_trace(
            go.Scatter(
                x=_weeks,
                y=_weekdays,
                mode="markers",
                marker=dict(
                    size=11,
                    symbol="square",
                    color=_colors_hm,
                    line=dict(color=BORDER, width=0.5),
                ),
                text=_hover,
                hoverinfo="text",
                showlegend=False,
            )
        )
        # Month labels on x-axis
        _month_ticks = []
        _month_labels = []
        _seen_months = set()
        for _d, _wk in zip(_dates_hm, _weeks):
            _m_key = (_d.year, _d.month)
            if _m_key not in _seen_months and _d.day <= 7:
                _seen_months.add(_m_key)
                _month_ticks.append(_wk)
                _month_labels.append(_d.strftime("%b %y"))
        _hm_fig.update_layout(
            **_layout(
                title=dict(
                    text="Buy Activity",
                    font=dict(size=CHART_TITLE_SIZE, color=TEXT),
                    x=0,
                ),
                height=180,
                margin=dict(l=40, r=20, t=40, b=30),
                showlegend=False,
                xaxis=dict(
                    tickmode="array",
                    tickvals=_month_ticks,
                    ticktext=_month_labels,
                    tickangle=0,
                    showgrid=False,
                    showspikes=False,
                    tickfont=dict(size=9),
                ),
                yaxis=dict(
                    tickmode="array",
                    tickvals=[0, 1, 2, 3, 4, 5, 6],
                    ticktext=["Mon", "", "Wed", "", "Fri", "", "Sun"],
                    showgrid=False,
                    autorange="reversed",
                    tickfont=dict(size=9),
                ),
            )
        )
        st.plotly_chart(_hm_fig, use_container_width=True, config={"scrollZoom": False})

        # ── Buy pattern analysis: by weekday + by time-of-month ──────────
        _pat_left, _pat_right = st.columns(2)

        # --- By weekday ---
        _wd_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        _buy_tx["weekday"] = _buy_tx["date"].dt.weekday
        _wd_agg = (
            _buy_tx.groupby("weekday")
            .agg(
                total=("amount_eur", lambda x: x.abs().sum()),
                count=("amount_eur", "count"),
            )
            .reindex(range(7), fill_value=0)
        )
        _wd_avg = _wd_agg["total"] / _wd_agg["count"].replace(0, 1)
        _wd_max_idx = _wd_agg["total"].idxmax()
        _wd_colors = [
            ACCENT if i == _wd_max_idx else f"rgba(37,99,235,0.35)" for i in range(7)
        ]
        _wd_fig = go.Figure()
        _wd_fig.add_trace(
            go.Bar(
                x=_wd_names,
                y=_wd_agg["total"],
                marker=dict(color=_wd_colors, line=dict(width=0)),
                hovertemplate=(
                    "<b>%{x}</b><br>"
                    "Total: %{y:,.0f} €<br>"
                    "Buys: %{customdata[0]}<br>"
                    "Avg: %{customdata[1]:,.0f} €"
                    "<extra></extra>"
                ),
                customdata=list(
                    zip(
                        _wd_agg["count"].astype(int).tolist(),
                        _wd_avg.round(0).tolist(),
                    )
                ),
                showlegend=False,
            )
        )
        _wd_fig.update_layout(
            **_layout(
                title=dict(
                    text="Buys by Weekday",
                    font=dict(size=CHART_TITLE_SIZE, color=TEXT),
                    x=0,
                ),
                height=220,
                margin=dict(l=50, r=20, t=40, b=30),
                showlegend=False,
                yaxis=dict(tickformat=",", tickprefix="€", showgrid=True),
                xaxis=dict(showgrid=False, showspikes=False),
            )
        )
        _pat_left.plotly_chart(
            _wd_fig, use_container_width=True, config={"scrollZoom": False}
        )

        # --- By time of month ---
        _tom_labels = ["1st–7th", "8th–14th", "15th–21st", "22nd–31st"]
        _buy_tx["dom"] = _buy_tx["date"].dt.day
        _buy_tx["tom_bin"] = pd.cut(
            _buy_tx["dom"],
            bins=[0, 7, 14, 21, 31],
            labels=_tom_labels,
        )
        _tom_agg = _buy_tx.groupby("tom_bin", observed=False).agg(
            total=("amount_eur", lambda x: x.abs().sum()),
            count=("amount_eur", "count"),
        )
        _tom_avg = _tom_agg["total"] / _tom_agg["count"].replace(0, 1)
        _tom_max_idx = _tom_agg["total"].idxmax()
        _tom_colors = [
            ACCENT if lbl == _tom_max_idx else f"rgba(37,99,235,0.35)"
            for lbl in _tom_labels
        ]
        _tom_fig = go.Figure()
        _tom_fig.add_trace(
            go.Bar(
                x=_tom_labels,
                y=_tom_agg["total"],
                marker=dict(color=_tom_colors, line=dict(width=0)),
                hovertemplate=(
                    "<b>%{x}</b><br>"
                    "Total: %{y:,.0f} €<br>"
                    "Buys: %{customdata[0]}<br>"
                    "Avg: %{customdata[1]:,.0f} €"
                    "<extra></extra>"
                ),
                customdata=list(
                    zip(
                        _tom_agg["count"].astype(int).tolist(),
                        _tom_avg.round(0).tolist(),
                    )
                ),
                showlegend=False,
            )
        )
        _tom_fig.update_layout(
            **_layout(
                title=dict(
                    text="Buys by Time of Month",
                    font=dict(size=CHART_TITLE_SIZE, color=TEXT),
                    x=0,
                ),
                height=220,
                margin=dict(l=50, r=20, t=40, b=30),
                showlegend=False,
                yaxis=dict(tickformat=",", tickprefix="€", showgrid=True),
                xaxis=dict(showgrid=False, showspikes=False),
            )
        )
        _pat_right.plotly_chart(
            _tom_fig, use_container_width=True, config={"scrollZoom": False}
        )

        # ── Trade frequency & size over time ─────────────────────────────
        _buy_tx["ym"] = _buy_tx["date"].dt.to_period("M")
        _mo_agg = _buy_tx.groupby("ym").agg(
            count=("amount_eur", "count"),
            total=("amount_eur", lambda x: x.abs().sum()),
        )
        _mo_agg["avg_size"] = _mo_agg["total"] / _mo_agg["count"]
        # Fill missing months with 0
        _full_months = pd.period_range(
            _mo_agg.index.min(), _mo_agg.index.max(), freq="M"
        )
        _mo_agg = _mo_agg.reindex(_full_months, fill_value=0)
        _mo_agg.loc[_mo_agg["count"] == 0, "avg_size"] = 0
        _mo_x = [str(p) for p in _mo_agg.index]

        _freq_left, _freq_right = st.columns(2)

        # --- Number of trades per month ---
        _freq_fig = go.Figure()
        _freq_fig.add_trace(
            go.Bar(
                x=_mo_x,
                y=_mo_agg["count"],
                marker=dict(color=f"rgba(37,99,235,0.5)", line=dict(width=0)),
                hovertemplate="<b>%{x}</b><br>Trades: %{y}<extra></extra>",
                showlegend=False,
                name="Trades",
            )
        )
        # Trend line
        _mo_idx = list(range(len(_mo_agg)))
        _nz_mask = _mo_agg["count"] > 0
        if _nz_mask.sum() >= 2:
            import numpy as np

            _z = np.polyfit(
                [i for i, m in zip(_mo_idx, _nz_mask) if m],
                _mo_agg.loc[_nz_mask, "count"].values,
                1,
            )
            _trend_count = [_z[0] * i + _z[1] for i in _mo_idx]
            _freq_fig.add_trace(
                go.Scatter(
                    x=_mo_x,
                    y=_trend_count,
                    mode="lines",
                    line=dict(color=TEXT, width=1.5, dash="dash"),
                    hoverinfo="skip",
                    showlegend=False,
                )
            )
        _freq_fig.update_layout(
            **_layout(
                title=dict(
                    text="Trades per Month",
                    font=dict(size=CHART_TITLE_SIZE, color=TEXT),
                    x=0,
                ),
                height=220,
                margin=dict(l=40, r=20, t=40, b=50),
                showlegend=False,
                yaxis=dict(
                    showgrid=True, dtick=max(1, int(_mo_agg["count"].max() / 5))
                ),
                xaxis=dict(
                    showgrid=False,
                    showspikes=False,
                    tickangle=-45,
                    tickfont=dict(size=9),
                ),
            )
        )
        _freq_left.plotly_chart(
            _freq_fig, use_container_width=True, config={"scrollZoom": False}
        )

        # --- Average trade size per month ---
        _size_fig = go.Figure()
        _size_fig.add_trace(
            go.Bar(
                x=_mo_x,
                y=_mo_agg["avg_size"],
                marker=dict(color=f"rgba(37,99,235,0.5)", line=dict(width=0)),
                hovertemplate=(
                    "<b>%{x}</b><br>"
                    "Avg size: %{y:,.0f} €<br>"
                    "Total: %{customdata[0]:,.0f} €<br>"
                    "Trades: %{customdata[1]}"
                    "<extra></extra>"
                ),
                customdata=list(
                    zip(
                        _mo_agg["total"].tolist(),
                        _mo_agg["count"].astype(int).tolist(),
                    )
                ),
                showlegend=False,
                name="Avg Size",
            )
        )
        # Trend line
        if _nz_mask.sum() >= 2:
            _z2 = np.polyfit(
                [i for i, m in zip(_mo_idx, _nz_mask) if m],
                _mo_agg.loc[_nz_mask, "avg_size"].values,
                1,
            )
            _trend_size = [_z2[0] * i + _z2[1] for i in _mo_idx]
            _size_fig.add_trace(
                go.Scatter(
                    x=_mo_x,
                    y=_trend_size,
                    mode="lines",
                    line=dict(color=TEXT, width=1.5, dash="dash"),
                    hoverinfo="skip",
                    showlegend=False,
                )
            )
        _size_fig.update_layout(
            **_layout(
                title=dict(
                    text="Avg Trade Size per Month",
                    font=dict(size=CHART_TITLE_SIZE, color=TEXT),
                    x=0,
                ),
                height=220,
                margin=dict(l=50, r=20, t=40, b=50),
                showlegend=False,
                yaxis=dict(tickformat=",", tickprefix="€", showgrid=True),
                xaxis=dict(
                    showgrid=False,
                    showspikes=False,
                    tickangle=-45,
                    tickfont=dict(size=9),
                ),
            )
        )
        _freq_right.plotly_chart(
            _size_fig, use_container_width=True, config={"scrollZoom": False}
        )

        # --- Total invested per month ---
        _tot_fig = go.Figure()
        _tot_fig.add_trace(
            go.Bar(
                x=_mo_x,
                y=_mo_agg["total"],
                marker=dict(color=f"rgba(37,99,235,0.5)", line=dict(width=0)),
                hovertemplate=(
                    "<b>%{x}</b><br>"
                    "Invested: %{y:,.0f} €<br>"
                    "Trades: %{customdata}"
                    "<extra></extra>"
                ),
                customdata=_mo_agg["count"].astype(int).tolist(),
                showlegend=False,
                name="Total",
            )
        )
        # Trend line
        if _nz_mask.sum() >= 2:
            _z3 = np.polyfit(
                [i for i, m in zip(_mo_idx, _nz_mask) if m],
                _mo_agg.loc[_nz_mask, "total"].values,
                1,
            )
            _trend_total = [_z3[0] * i + _z3[1] for i in _mo_idx]
            _tot_fig.add_trace(
                go.Scatter(
                    x=_mo_x,
                    y=_trend_total,
                    mode="lines",
                    line=dict(color=TEXT, width=1.5, dash="dash"),
                    hoverinfo="skip",
                    showlegend=False,
                )
            )
        # Cumulative line on secondary y-axis
        _cum_total = list(_mo_agg["total"].cumsum())
        _tot_fig.add_trace(
            go.Scatter(
                x=_mo_x,
                y=_cum_total,
                mode="lines+markers",
                line=dict(color=ACCENT, width=2),
                marker=dict(size=4, color=ACCENT),
                yaxis="y2",
                hovertemplate="Cumulative: <b>%{y:,.0f} €</b><extra></extra>",
                showlegend=False,
                name="Cumulative",
            )
        )
        _tot_fig.update_layout(
            **_layout(
                title=dict(
                    text="Total Invested per Month",
                    font=dict(size=CHART_TITLE_SIZE, color=TEXT),
                    x=0,
                ),
                height=220,
                margin=dict(l=50, r=60, t=40, b=50),
                showlegend=False,
                yaxis=dict(tickformat=",", tickprefix="€", showgrid=True),
                yaxis2=dict(
                    tickformat=",",
                    tickprefix="€",
                    overlaying="y",
                    side="right",
                    showgrid=False,
                    tickfont=dict(color=ACCENT, size=9),
                ),
                xaxis=dict(
                    showgrid=False,
                    showspikes=False,
                    tickangle=-45,
                    tickfont=dict(size=9),
                ),
            )
        )
        st.plotly_chart(
            _tot_fig, use_container_width=True, config={"scrollZoom": False}
        )


    st.divider()
    st.subheader("Monthly Overview")
    _ov_dates = sorted(all_dates)[-12:]
    _cols_ov = [pd.Timestamp(d).strftime("%b '%y") for d in _ov_dates]

    _tbl, _bkd, _top_map = compute_ov_data(
        tuple(_ov_dates), df_all, _tx_all, tuple(all_dates), dict(_holdings_tickers)
    )

    # ── Row / style constants ─────────────────────────────────────────────────
    _BOLD_OV = {"Portfolio", "Cash", "Total End Balance"}
    _MUTED_OV = {
        "  Port. Start",
        "  Invested",
        "  Proceeds",
        "  Price Effect",
        "  Port. End",
        "  Cash Start",
        "  C. Invested",
        "  C. Proceeds",
        "Dividends",
        "Interest",
        "  Deposits",
        "  Withdrawals",
        "  Cash End",
    }
    _row_order = [
        "Portfolio",
        "  Port. Start",
        "  Invested",
        "  Proceeds",
        "  Price Effect",
        "  Port. End",
        "Cash",
        "  Cash Start",
        "  C. Invested",
        "  C. Proceeds",
        "Dividends",
        "Interest",
        "  Deposits",
        "  Withdrawals",
        "  Cash End",
        "Total End Balance",
    ]
    _EXPANDABLE = {"  Price Effect", "Dividends", "  Invested", "  Proceeds"}
    _row_labels = {
        "  Port. Start": "  Start Balance",
        "  Port. End": "  End Balance",
        "  Cash Start": "  Start Balance",
        "  C. Invested": "  Invested",
        "  C. Proceeds": "  Proceeds",
        "Dividends": "  Dividends",
        "Interest": "  Interest",
        "  Cash End": "  End Balance",
        "Total End Balance": "Total End Balance",
    }

    # ── Pills — multi-select to expand contributor rows ───────────────────────
    _pill_map = {
        _row_labels.get(r, r).strip(): r
        for r in _row_order
        if r in _EXPANDABLE and _top_map.get(r)
    }
    _selected = st.pills(
        "Show contributors for",
        options=list(_pill_map.keys()),
        selection_mode="multi",
        default=None,
    )
    _expanded_set = {_pill_map[p] for p in (_selected or [])}

    # ── Build row specs ───────────────────────────────────────────────────────
    _row_specs: list[tuple[str, object]] = []
    for _r in _row_order:
        _label = _row_labels.get(_r, _r)
        _row_specs.append((_label, _r))
        if _r in _expanded_set:
            for _tk in _top_map.get(_r, []):
                _row_specs.append((f"    {_tk}", (_r, _tk)))

    _final_labels = [s[0] for s in _row_specs]
    _final_sources = [s[1] for s in _row_specs]

    # ── Format / value helpers ────────────────────────────────────────────────
    def _ov_fmt(v):
        if v is None or (isinstance(v, float) and pd.isna(v)):
            return "—"
        if v == 0.0:
            return "—"
        return f"{v:,.0f}"

    def _get_val(src, c):
        if isinstance(src, str):
            return _tbl[src].get(c)
        _parent, _ticker = src
        return _bkd[_parent].get(c, {}).get(_ticker)

    # ── Build & render HTML table ─────────────────────────────────────────────
    _hdr_cells = ["<th></th>"] + [f"<th>{c}</th>" for c in _cols_ov]
    _rows_html = []
    for lbl, src in zip(_final_labels, _final_sources):
        src_key = src if isinstance(src, str) else src[0]
        if src_key in _BOLD_OV:
            _rc = "ov-bold"
        elif lbl.startswith("    "):
            _rc = "ov-contrib"
        elif src_key in _MUTED_OV:
            _rc = "ov-muted"
        else:
            _rc = ""
        _stripped = lbl.lstrip(" ")
        _indent = "&nbsp;" * (len(lbl) - len(_stripped))
        _cells = [f"<td>{_indent}{_stripped}</td>"] + [
            f"<td>{_ov_fmt(_get_val(src, c))}</td>" for c in _cols_ov
        ]
        _rows_html.append(f'<tr class="{_rc}">{"".join(_cells)}</tr>')

    st.markdown(
        f'<table class="ov-table">'
        f'<thead><tr>{"".join(_hdr_cells)}</tr></thead>'
        f'<tbody>{"".join(_rows_html)}</tbody>'
        f"</table>",
        unsafe_allow_html=True,
    )

    _ov_export_rows = []
    for lbl, src in zip(_final_labels, _final_sources):
        _ov_export_rows.append(
            {"": lbl.strip()} | {c: _get_val(src, c) for c in _cols_ov}
        )
    _ov_csv = pd.DataFrame(_ov_export_rows).to_csv(index=False).encode("utf-8")
    st.download_button(
        label="⬇ Export as CSV",
        data=_ov_csv,
        file_name="overview.csv",
        mime="text/csv",
    )

    # ── Dividends ─────────────────────────────────────────────────────────────
    st.divider()
    st.subheader("Dividends")

    _portfolio_start = pd.Timestamp(all_dates[0])
    _div_df = _tx_all[
        (_tx_all["direction"] == "dividend") & (_tx_all["date"] >= _portfolio_start)
    ].copy()
    _div_df["company"] = _div_df["isin"].map(_all_tickers).fillna(_div_df["isin"])
    _div_df["month"] = _div_df["date"].dt.to_period("M").dt.to_timestamp()
    _div_df["year"] = _div_df["date"].dt.year

    _div_color_map = {
        c: COLORS[i % len(COLORS)]
        for i, c in enumerate(sorted(_div_df["company"].unique()))
    }

    # 1. Total by company — horizontal bar
    _div_by_co = (
        _div_df.groupby("company")["amount_eur"].sum().sort_values().reset_index()
    )
    _fig_div_co = go.Figure(
        go.Bar(
            x=_div_by_co["amount_eur"],
            y=_div_by_co["company"],
            orientation="h",
            marker_color=[_div_color_map[c] for c in _div_by_co["company"]],
            hovertemplate="<b>%{y}</b><br>Total: %{x:,.2f} €<extra></extra>",
            text=_div_by_co["amount_eur"].map(lambda v: f"{v:,.2f} €"),
            textposition="outside",
        )
    )
    _fig_div_co.update_layout(
        **_layout(
            title=dict(
                text="Total Dividends by Company",
                font=dict(size=CHART_TITLE_SIZE, color=TEXT),
                x=0,
            ),
            height=40 + len(_div_by_co) * 36,
            margin=dict(l=160, r=80, t=40, b=40),
            xaxis=dict(
                ticksuffix=" €",
                rangemode="tozero",
                range=[0, _div_by_co["amount_eur"].max() * 1.25],
            ),
            yaxis=dict(tickfont=dict(size=11)),
        )
    )
    st.plotly_chart(_fig_div_co, use_container_width=True, config={"scrollZoom": False})

    # 2. Income over time — stacked bar by company
    _div_monthly = (
        _div_df.groupby(["month", "company"])["amount_eur"]
        .sum()
        .unstack(fill_value=0)
        .reset_index()
    )
    _fig_div_time = go.Figure()
    for _co in _div_monthly.columns[1:]:
        _fig_div_time.add_trace(
            go.Bar(
                x=_div_monthly["month"],
                y=_div_monthly[_co],
                name=_co,
                marker_color=_div_color_map[_co],
                hovertemplate=f"<b>{_co}</b><br>%{{x|%b %Y}}: %{{y:,.2f}} €<extra></extra>",
            )
        )
    _fig_div_time.update_layout(
        **_layout(
            title=dict(
                text="Monthly Dividend Income",
                font=dict(size=CHART_TITLE_SIZE, color=TEXT),
                x=0,
            ),
            height=280,
            barmode="stack",
            margin=dict(l=60, r=20, t=40, b=60),
            legend=dict(orientation="h", x=0, y=1.1, font=dict(size=10)),
            xaxis=dict(
                tickmode="array",
                tickvals=list(_div_monthly["month"]),
                tickformat="%b %y",
            ),
            yaxis=dict(ticksuffix=" €", rangemode="tozero"),
        )
    )
    st.plotly_chart(
        _fig_div_time, use_container_width=True, config={"scrollZoom": False}
    )

    # 3. Cumulative income line  +  4. Y-o-Y table
    _col_cum, _col_yoy = st.columns(2)

    with _col_cum:
        _div_sorted = _div_df.sort_values("date")
        _div_sorted["cumulative"] = _div_sorted["amount_eur"].cumsum()
        _fig_cum = go.Figure(
            go.Scatter(
                x=_div_sorted["date"],
                y=_div_sorted["cumulative"],
                mode="lines",
                line=dict(color=COLORS[3], width=2),
                fill="tozeroy",
                fillcolor=f"rgba(124,58,237,0.08)",
                hovertemplate="%{x|%Y-%m-%d}<br><b>Cumulative: %{y:,.2f} €</b><extra></extra>",
            )
        )
        _fig_cum.update_layout(
            **_layout(
                height=280,
                margin=dict(l=60, r=20, t=30, b=60),
                title=dict(
                    text="Cumulative Dividends",
                    font=dict(size=CHART_TITLE_SIZE, color=TEXT),
                    x=0,
                ),
                xaxis=dict(
                    tickmode="array",
                    tickvals=list(
                        pd.date_range(
                            _div_sorted["date"].min().to_period("M").to_timestamp(),
                            _div_sorted["date"].max().to_period("M").to_timestamp(),
                            freq="MS",
                        )
                    ),
                    tickformat="%b %y",
                ),
                yaxis=dict(ticksuffix=" €", rangemode="tozero"),
            )
        )
        st.plotly_chart(
            _fig_cum, use_container_width=True, config={"scrollZoom": False}
        )

    with _col_yoy:
        st.markdown(
            f"<p style='font-size:13px;color:{TEXT};font-weight:600;"
            f"margin:0 0 0.5rem;'>Dividends by Year</p>",
            unsafe_allow_html=True,
        )
        _yoy = (
            _div_df.groupby(["company", "year"])["amount_eur"]
            .sum()
            .unstack(fill_value=0)
            .round(2)
        )
        _yoy.index.name = "Company"
        _yoy.columns = [str(c) for c in _yoy.columns]
        _yoy["Total"] = _yoy.sum(axis=1)
        _yoy = _yoy.sort_values("Total", ascending=False)
        st.dataframe(
            _yoy.style.format("{:,.2f}"),
            use_container_width=True,
            height=min(50 + len(_yoy) * 35, 280),
        )

    # ── Interest ──────────────────────────────────────────────────────────────
    st.divider()
    st.subheader("Interest")

    _int_monthly = (
        _tx_all[
            (_tx_all["direction"] == "interest") & (_tx_all["date"] >= _portfolio_start)
        ]
        .assign(month=lambda d: d["date"].dt.to_period("M").dt.to_timestamp())
        .groupby("month")["amount_eur"]
        .sum()
        .reset_index()
    )
    _int_df_sorted = (
        _tx_all[
            (_tx_all["direction"] == "interest") & (_tx_all["date"] >= _portfolio_start)
        ]
        .sort_values("date")
        .copy()
    )
    _int_df_sorted["cumulative"] = _int_df_sorted["amount_eur"].cumsum()

    _col_int_bar, _col_int_cum = st.columns(2)

    with _col_int_bar:
        _fig_int = go.Figure(
            go.Bar(
                x=_int_monthly["month"],
                y=_int_monthly["amount_eur"],
                marker_color=COLORS[2],
                hovertemplate="%{x|%b %Y}<br><b>%{y:,.2f} €</b><extra></extra>",
            )
        )
        _fig_int.update_layout(
            **_layout(
                height=240,
                margin=dict(l=60, r=20, t=30, b=60),
                title=dict(
                    text="Monthly Interest",
                    font=dict(size=CHART_TITLE_SIZE, color=TEXT),
                    x=0,
                ),
                xaxis=dict(
                    tickmode="array",
                    tickvals=list(_int_monthly["month"]),
                    tickformat="%b %y",
                ),
                yaxis=dict(ticksuffix=" €", rangemode="tozero"),
            )
        )
        st.plotly_chart(
            _fig_int, use_container_width=True, config={"scrollZoom": False}
        )

    with _col_int_cum:
        _fig_int_cum = go.Figure(
            go.Scatter(
                x=_int_df_sorted["date"],
                y=_int_df_sorted["cumulative"],
                mode="lines",
                line=dict(color=COLORS[2], width=2),
                fill="tozeroy",
                fillcolor=f"rgba(217,119,6,0.08)",
                hovertemplate="%{x|%Y-%m-%d}<br><b>Cumulative: %{y:,.2f} €</b><extra></extra>",
            )
        )
        _fig_int_cum.update_layout(
            **_layout(
                height=240,
                margin=dict(l=60, r=20, t=30, b=60),
                title=dict(
                    text="Cumulative Interest",
                    font=dict(size=CHART_TITLE_SIZE, color=TEXT),
                    x=0,
                ),
                xaxis=dict(
                    tickmode="array",
                    tickvals=list(
                        pd.date_range(
                            _int_df_sorted["date"].min().to_period("M").to_timestamp(),
                            _int_df_sorted["date"].max().to_period("M").to_timestamp(),
                            freq="MS",
                        )
                    ),
                    tickformat="%b %y",
                ),
                yaxis=dict(ticksuffix=" €", rangemode="tozero"),
            )
        )
        st.plotly_chart(
            _fig_int_cum, use_container_width=True, config={"scrollZoom": False}
        )


    # ── Portfolio history ─────────────────────────────────────────────────────
    st.divider()
    if len(all_dates) > 1:
        st.subheader("Position Race")

        st.plotly_chart(
            animated_bar_race(df_all, all_dates, COLOR_MAP),
            use_container_width=True,
            config={"scrollZoom": False},
        )

        # ── Animated pie chart ────────────────────────────────────────────────
        st.divider()
        st.subheader("Allocation Race")

        st.plotly_chart(
            animated_pie_race(df_all, all_dates, COLOR_MAP),
            use_container_width=True,
            config={"scrollZoom": False},
        )


    with st.expander("All Statements"):
        _export_df = (
            df_all[
                [
                    "statement_date",
                    "name",
                    "isin",
                    "shares",
                    "price_eur",
                    "market_value_eur",
                ]
            ]
            .rename(
                columns={
                    "statement_date": "Date",
                    "name": "Name",
                    "isin": "ISIN",
                    "shares": "Shares",
                    "price_eur": "Price (€)",
                    "market_value_eur": "Market Value (€)",
                }
            )
            .sort_values(["Date", "Market Value (€)"], ascending=[False, False])
            .reset_index(drop=True)
        )

        _export_df["Date"] = _export_df["Date"].dt.strftime("%Y-%m-%d")

        st.dataframe(
            _export_df.style.format(
                {
                    "Shares": "{:,.4f}",
                    "Price (€)": "{:,.2f}",
                    "Market Value (€)": "{:,.2f}",
                }
            ),
            use_container_width=True,
            hide_index=True,
            height=min(50 + len(_export_df) * 35, 700),
        )

        st.download_button(
            label="⬇ Export as CSV",
            data=_export_df.to_csv(index=False).encode("utf-8"),
            file_name="portfolio_all_statements.csv",
            mime="text/csv",
        )



def _render_tx_tab():
    _tx = _tx_all

    # ── Transaction table ─────────────────────────────────────────────────────
    st.subheader("All Transactions")

    # ── ISIN → ticker lookup for filter + column ──────────────────────────────
    _isin_to_tkr: dict = {}
    for _isin in _tx["isin"].dropna().unique():
        _tkr = _all_tickers.get(_isin, "")
        if _tkr:
            _isin_to_tkr[_isin] = _tkr
    _ticker_opts = sorted(set(_isin_to_tkr.values()))

    _f1, _f2, _f3 = st.columns([2, 2, 3])
    with _f1:
        _dir_opts = [
            "buy",
            "sell",
            "dividend",
            "interest",
            "saveback",
            "card",
            "card_refund",
            "deposit",
            "withdrawal",
        ]
        _dir_sel = st.multiselect(
            "Direction",
            _dir_opts,
            default=["buy", "sell", "dividend", "interest", "saveback"],
        )
    with _f2:
        _ticker_sel = st.multiselect("Ticker", _ticker_opts)
    with _f3:
        import datetime as _dt

        _min_d = _tx["date"].min().date() if len(_tx) else _dt.date.today()
        _max_d = _tx["date"].max().date() if len(_tx) else _dt.date.today()
        _date_range = st.date_input(
            "Date range", value=(_min_d, _max_d), min_value=_min_d, max_value=_max_d
        )

    _tx_view = _tx[_tx["direction"].isin(_dir_sel)].copy() if _dir_sel else _tx.copy()
    if _ticker_sel:
        _sel_isins = {i for i, t in _isin_to_tkr.items() if t in _ticker_sel}
        _tx_view = _tx_view[_tx_view["isin"].isin(_sel_isins)]
    if isinstance(_date_range, (list, tuple)) and len(_date_range) == 2:
        _tx_view = _tx_view[
            (_tx_view["date"].dt.date >= _date_range[0])
            & (_tx_view["date"].dt.date <= _date_range[1])
        ]

    _tx_view = _tx_view.copy()
    _tx_view["name"] = _tx_view["name"].fillna(_tx_view["isin"].map(_all_tickers))
    _tx_view["ticker"] = _tx_view["isin"].map(_isin_to_tkr).fillna("—")

    # ── Current price per ISIN from the latest statement ──────────────────────
    _latest_d = df_all["statement_date"].max()
    _latest_rows = df_all[df_all["statement_date"] == _latest_d]
    _curr_px: dict = {}
    for _, _lr in _latest_rows.iterrows():
        # df_all uses "shares" for share count (transactions use "quantity")
        if pd.notna(_lr.get("shares")) and _lr["shares"] > 0:
            _curr_px[_lr["isin"]] = _lr["market_value_eur"] / _lr["shares"]

    # ── Per-row tx price, current price and simple performance ──────────────
    _is_trade = _tx_view["direction"].isin(["buy", "sell"])
    _qty_ok = _tx_view["quantity"].notna() & (_tx_view["quantity"].abs() > 0)

    _tx_view["tx_price"] = None
    _tx_view["curr_price"] = None
    _tx_view["performance"] = None
    _tx_view["perf_pnl"] = None

    _mask = _is_trade & _qty_ok
    _tx_view.loc[_mask, "tx_price"] = (
        _tx_view.loc[_mask, "amount_eur"].abs() / _tx_view.loc[_mask, "quantity"].abs()
    )
    _tx_view.loc[_mask, "curr_price"] = _tx_view.loc[_mask, "isin"].map(_curr_px)
    _perf_mask = _mask & _tx_view["curr_price"].notna()
    _tx_view.loc[_perf_mask, "performance"] = (
        _tx_view.loc[_perf_mask, "curr_price"] / _tx_view.loc[_perf_mask, "tx_price"]
        - 1
    ) * 100
    _tx_view.loc[_perf_mask, "perf_pnl"] = (
        _tx_view.loc[_perf_mask, "curr_price"] - _tx_view.loc[_perf_mask, "tx_price"]
    ) * _tx_view.loc[_perf_mask, "quantity"].abs()

    # ── FIFO-based performance (uses shared utility) ─────────────────────────
    _fifo_lots = compute_fifo_lots(_tx, _curr_px)
    _fifo_perf: dict = {}
    _fifo_pnl: dict = {}
    _fifo_sell_px: dict = {}
    for _lot in _fifo_lots:
        _p, _pl, _sp = fifo_lot_perf(_lot, _curr_px)
        _fifo_perf[_lot.idx] = _p
        _fifo_pnl[_lot.idx] = _pl
        if _sp is not None:
            _fifo_sell_px[_lot.idx] = _sp

    _tx_view["fifo_perf"] = _tx_view.index.map(_fifo_perf)
    _tx_view["fifo_pnl"] = _tx_view.index.map(_fifo_pnl)
    _tx_view["sell_price"] = _tx_view.index.map(_fifo_sell_px)

    # Mark approximated rows: qty/price derived from daily close, not from PDF
    _is_approx = (
        _tx_view.get("approx", pd.Series(0, index=_tx_view.index))
        .fillna(0)
        .astype(bool)
    )

    _tx_display = (
        _tx_view[
            [
                "date",
                "direction",
                "ticker",
                "name",
                "isin",
                "quantity",
                "amount_eur",
                "tx_price",
                "curr_price",
                "sell_price",
                "performance",
                "perf_pnl",
                "fifo_perf",
                "fifo_pnl",
                "balance_eur",
            ]
        ]
        .rename(
            columns={
                "date": "Date",
                "direction": "Direction",
                "ticker": "Ticker",
                "name": "Name",
                "isin": "ISIN",
                "quantity": "Qty",
                "amount_eur": "Amount (€)",
                "tx_price": "Tx Price (€)",
                "curr_price": "Curr Price (€)",
                "sell_price": "Sell Price (€)",
                "performance": "Perf (%)",
                "perf_pnl": "Perf (€)",
                "fifo_perf": "FIFO Perf (%)",
                "fifo_pnl": "FIFO P&L (€)",
                "balance_eur": "Balance (€)",
            }
        )
        .copy()
    )
    # Prefix approximated Qty and Tx Price with ~ for transparency
    _approx_mask = _is_approx.values
    for _col in ("Qty", "Tx Price (€)"):
        _tx_display[_col] = [
            (
                f"~{v:,.6g}"
                if _col == "Qty" and approx and pd.notna(v)
                else (
                    f"~{v:,.2f}"
                    if _col == "Tx Price (€)" and approx and pd.notna(v)
                    else v
                )
            )
            for v, approx in zip(_tx_display[_col], _approx_mask)
        ]
    _tx_display = _tx_display.sort_values("Date", ascending=False).reset_index(
        drop=True
    )
    _tx_display["Date"] = _tx_display["Date"].dt.strftime("%Y-%m-%d")

    def _perf_color(val):
        if pd.isna(val):
            return ""
        return f"color: {POSITIVE if val >= 0 else NEGATIVE}; font-weight: 600"

    st.dataframe(
        _tx_display.style.format(
            {
                "Amount (€)": "{:+,.2f}",
                "Curr Price (€)": lambda v: f"{v:,.2f}" if pd.notna(v) else "—",
                "Sell Price (€)": lambda v: f"{v:,.2f}" if pd.notna(v) else "—",
                "Perf (%)": lambda v: f"{v:+.1f}%" if pd.notna(v) else "—",
                "Perf (€)": lambda v: f"{v:+,.2f}" if pd.notna(v) else "—",
                "FIFO Perf (%)": lambda v: f"{v:+.1f}%" if pd.notna(v) else "—",
                "FIFO P&L (€)": lambda v: f"{v:+,.2f}" if pd.notna(v) else "—",
                "Balance (€)": "{:,.2f}",
            }
        ).applymap(
            _perf_color,
            subset=["Perf (%)", "Perf (€)", "FIFO Perf (%)", "FIFO P&L (€)"],
        ),
        use_container_width=True,
        hide_index=True,
        height=min(50 + len(_tx_display) * 35, 600),
    )

    st.download_button(
        label="⬇ Export as CSV",
        data=_tx_view.to_csv(index=False).encode("utf-8"),
        file_name="transactions.csv",
        mime="text/csv",
    )


# ── Settings tab ─────────────────────────────────────────────────────────────


def _render_settings_tab():
    _set_left, _set_right = st.columns(2)

    # ── Target Allocations ────────────────────────────────────────────────
    with _set_left:
        st.subheader("Target Allocations")
        if "targets" not in st.session_state:
            st.session_state.targets = db.load_targets()

        # Build name/ISIN list from current holdings
        _curr_isins = df_sel["isin"].unique()
        _tgt_rows = []
        for _isin in _curr_isins:
            _name = _all_tickers.get(_isin, _isin)
            _tgt_rows.append(
                {
                    "Name": _name,
                    "ISIN": _isin,
                    "Target Weight": st.session_state.targets.get(_isin, 0.0),
                }
            )
        _tgt_df = pd.DataFrame(_tgt_rows)

        _target_cfg = {
            "Target Weight": st.column_config.NumberColumn(
                format="%.1f%%",
                min_value=0,
                max_value=100,
                step=0.5,
            ),
        }
        edited = st.data_editor(
            _tgt_df,
            use_container_width=True,
            hide_index=True,
            column_config=_target_cfg,
            column_order=["Name", "Target Weight"],
            disabled=["Name", "ISIN"],
            key="settings_targets",
        )

        new_targets = dict(zip(edited["ISIN"], edited["Target Weight"]))
        if new_targets != {
            k: st.session_state.targets.get(k, 0.0) for k in new_targets
        }:
            st.session_state.targets.update(new_targets)
            db.save_targets(st.session_state.targets)

    # ── Manage Statements ─────────────────────────────────────────────────
    with _set_right:
        st.subheader("Loaded Statements")
        st.caption(
            f"📊 {len(all_dates)} statements · "
            f"{all_dates[0].strftime('%b %y')} – {all_dates[-1].strftime('%b %y')}"
        )
        for _d in sorted(all_dates, reverse=True):
            _col_lbl, _col_btn = st.columns([5, 1])
            _col_lbl.write(_d.strftime("%b %Y"))
            if _col_btn.button(
                "✕", key=f"set_del_{_d}", help=f"Remove {_d.strftime('%b %Y')}"
            ):
                db.delete_statement(_d)
                for _pdf in RAW_DATA_DIR.glob("*.pdf"):
                    try:
                        if parse_pdf(_pdf)["statement_date"].iloc[0] == _d.date():
                            _pdf.unlink()
                            break
                    except Exception:
                        pass
                load_all_statements.clear()
                st.rerun()

        st.divider()
        _tx_count = len(_tx_all)
        _tx_range = (
            f"{_tx_all['date'].min().strftime('%b %y')} – "
            f"{_tx_all['date'].max().strftime('%b %y')}"
            if _tx_count > 0
            else "—"
        )
        st.caption(f"💳 {_tx_count} transactions · {_tx_range}")


# ── Tax tab ───────────────────────────────────────────────────────────────────

_KAP_RATE = 0.25 * 1.055  # 26.375 % Abgeltungssteuer + Solidaritätszuschlag
_TAX_START_YEAR = 2025


def _render_tax_tab():
    st.subheader("Kapitalertragssteuer Overview")
    st.caption(
        "Shows taxable events (sells, dividends, interest) from 2025 onwards. "
        "Sell gains use FIFO cost basis across full transaction history. "
        "Rate: 25% + 5.5% Soli = **26.375%**. TR withholds at source."
    )

    # ── Year selector ─────────────────────────────────────────────────────────
    _tax_years = sorted(
        {d.year for d in _tx_all["date"] if d.year >= _TAX_START_YEAR},
        reverse=True,
    )
    if not _tax_years:
        st.info("No taxable events found since 2025.")
        return
    _yr = st.selectbox("Tax year", _tax_years, index=0, key="tax_year")

    # ── Freistellungsauftrag ──────────────────────────────────────────────────
    _fsa = st.number_input(
        "Freistellungsauftrag (€)",
        value=1000,
        min_value=0,
        max_value=2000,
        step=50,
        key="tax_fsa",
        help="Annual tax-free allowance set with your broker. Max €1,000 (single) / €2,000 (married).",
    )

    # ── ISIN → name map (from all statements) ────────────────────────────────
    _isin_name = (
        df_all.dropna(subset=["isin", "name"]).groupby("isin")["name"].first().to_dict()
    )

    # ── Realized gains (FIFO) ────────────────────────────────────────────────
    _rg_all = compute_realized_gains(_tx_all)
    _rg_year = _rg_all[_rg_all["date"].dt.year == _yr].copy()
    _rg_year["name"] = _rg_year.apply(
        lambda r: _isin_name.get(r["isin"], r["name"]), axis=1
    )

    # ── Dividends + interest for the year ────────────────────────────────────
    _di_year = _tx_all[
        (_tx_all["direction"].isin(["dividend", "interest"]))
        & (_tx_all["date"].dt.year == _yr)
    ].copy()
    _di_year["name"] = _di_year.apply(
        lambda r: (
            _isin_name.get(r["isin"], r["name"]) if pd.notna(r["isin"]) else "Interest"
        ),
        axis=1,
    )

    # ── Annual totals ─────────────────────────────────────────────────────────
    _gains_sum = _rg_year["gain_loss"].sum()
    _losses_sum = _rg_year[_rg_year["gain_loss"] < 0]["gain_loss"].sum()
    _divs_sum = _di_year[_di_year["direction"] == "dividend"]["amount_eur"].sum()
    _int_sum = _di_year[_di_year["direction"] == "interest"]["amount_eur"].sum()
    _gross = _gains_sum + _divs_sum + _int_sum
    _net = max(0.0, _gross - _fsa)
    _est_tax = round(_net * _KAP_RATE, 2)
    _fsa_used = min(float(_fsa), max(0.0, _gross))
    _fsa_remain = float(_fsa) - _fsa_used

    # ── Summary KPI row ───────────────────────────────────────────────────────
    _s1, _s2, _s3, _s4 = st.columns(4)
    _kpi(
        _s1,
        "Realized Gains/Losses",
        f"{_gains_sum:+,.2f} €",
        value_color=_dc(_gains_sum),
        subtitle=f"{len(_rg_year)} sell events · losses: {_losses_sum:,.2f} €",
    )
    _kpi(
        _s2,
        "Dividends + Interest",
        f"{_divs_sum + _int_sum:,.2f} €",
        subtitle=f"Dividends {_divs_sum:,.2f} € · Interest {_int_sum:,.2f} €",
    )
    _kpi(
        _s3,
        "Gross Taxable",
        f"{_gross:,.2f} €",
        value_color=_dc(_gross),
        subtitle=f"FSA used {_fsa_used:,.2f} € · remaining {_fsa_remain:,.2f} €",
    )
    _kpi(
        _s4,
        "Est. Tax Withheld",
        f"{_est_tax:,.2f} €",
        value_color=NEGATIVE if _est_tax > 0 else TEXT,
        subtitle=f"Net taxable {_net:,.2f} € × 26.375%",
    )

    # Freistellungsauftrag progress bar
    st.markdown("<div style='margin-top:1rem'></div>", unsafe_allow_html=True)
    _fsa_pct = min(1.0, _fsa_used / _fsa) if _fsa > 0 else 0.0
    _bar_color = (
        NEGATIVE if _fsa_pct >= 1.0 else (COLORS[2] if _fsa_pct > 0.7 else POSITIVE)
    )
    st.markdown(
        f"<div style='margin-bottom:0.25rem;font-size:0.85rem;color:{MUTED};'>"
        f"Freistellungsauftrag used: <b style='color:{TEXT}'>{_fsa_used:,.2f} €</b> "
        f"/ {_fsa:,.0f} € "
        f"<span style='color:{_bar_color}'>({_fsa_pct*100:.0f}%)</span></div>"
        f"<div style='background:{BORDER};border-radius:4px;height:6px;'>"
        f"<div style='background:{_bar_color};width:{_fsa_pct*100:.1f}%;height:6px;border-radius:4px;'></div>"
        f"</div>",
        unsafe_allow_html=True,
    )

    st.divider()

    # ── Transaction table ─────────────────────────────────────────────────────
    st.subheader("Taxable Events")

    # Build unified rows
    _rows = []
    for _, r in _rg_year.iterrows():
        _rows.append(
            {
                "Date": r["date"].strftime("%Y-%m-%d"),
                "Type": "Sell",
                "Name": r["name"],
                "Amount (€)": r["proceeds"],
                "Cost Basis (€)": r["cost_basis"],
                "Gain / Loss (€)": r["gain_loss"],
            }
        )
    for _, r in _di_year.sort_values("date").iterrows():
        _label = "Dividend" if r["direction"] == "dividend" else "Interest"
        _rows.append(
            {
                "Date": r["date"].strftime("%Y-%m-%d"),
                "Type": _label,
                "Name": r["name"] or _label,
                "Amount (€)": r["amount_eur"],
                "Cost Basis (€)": None,
                "Gain / Loss (€)": r["amount_eur"],
            }
        )

    if not _rows:
        st.info(f"No taxable events in {_yr}.")
        return

    _rows.sort(key=lambda r: r["Date"])

    # Total row
    _rows.append(
        {
            "Date": "Total",
            "Type": "",
            "Name": "",
            "Amount (€)": _rg_year["proceeds"].sum() + _divs_sum + _int_sum,
            "Cost Basis (€)": _rg_year["cost_basis"].sum() if len(_rg_year) else None,
            "Gain / Loss (€)": _gross,
        }
    )

    # Render HTML table
    _tx_cols = [
        "Date",
        "Type",
        "Name",
        "Amount (€)",
        "Cost Basis (€)",
        "Gain / Loss (€)",
    ]
    _tx_fmt = {
        "Amount (€)": "{:,.2f} €",
        "Cost Basis (€)": "{:,.2f} €",
        "Gain / Loss (€)": "{:+,.2f} €",
    }
    _last_i = len(_rows) - 1
    _hdr = "".join(f"<th>{c}</th>" for c in _tx_cols)
    _trs = []
    for i, row in enumerate(_rows):
        _rc = "hd-total" if i == _last_i else ""
        _cells = []
        for c in _tx_cols:
            val = row[c]
            if val is None or val == "":
                text = "—" if val is None else ""
            elif c in _tx_fmt:
                try:
                    text = _tx_fmt[c].format(val)
                except (TypeError, ValueError):
                    text = str(val)
            else:
                text = str(val)
            style = ""
            if c == "Gain / Loss (€)" and val not in (None, "") and i != _last_i:
                color = MUTED if val == 0 else (POSITIVE if val > 0 else NEGATIVE)
                style = f' style="color:{color}"'
            elif c == "Gain / Loss (€)" and i == _last_i and isinstance(val, float):
                color = MUTED if val == 0 else (POSITIVE if val > 0 else NEGATIVE)
                style = f' style="color:{color}"'
            elif c == "Type":
                color = (
                    POSITIVE
                    if val == "Sell"
                    and row["Gain / Loss (€)"]
                    and row["Gain / Loss (€)"] >= 0
                    else NEGATIVE if val == "Sell" else MUTED
                )
                style = f' style="color:{color}"'
            _cells.append(f"<td{style}>{text}</td>")
        _trs.append(f'<tr class="{_rc}">{"".join(_cells)}</tr>')

    st.markdown(
        f'<table class="hd-table">'
        f"<thead><tr>{_hdr}</tr></thead>"
        f'<tbody>{"".join(_trs)}</tbody>'
        f"</table>",
        unsafe_allow_html=True,
    )



# ── Tab dispatch ──────────────────────────────────────────────────────────────
with _tab_main:
    _render_overview_tab()

with _tab_perf:
    _render_performance_tab()

with _tab_act:
    _render_activity_tab()

with _tab_tx:
    _render_tx_tab()

with _tab_tax:
    _render_tax_tab()

with _tab_settings:
    _render_settings_tab()

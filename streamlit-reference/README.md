# Trade Republic Portfolio Dashboard

A personal portfolio analytics app for **Trade Republic** customers. Upload your monthly PDF statements and get institutional-quality performance tracking, FIFO cost basis accounting, benchmark comparison, and German tax (Kapitalertragssteuer) reporting — all in a local Streamlit app.

---

## Features

### Dashboard Tab
- **KPI Row 1** — Total Portfolio Value · Positions · Price Delta · Net Invested (all vs. previous statement)
- **KPI Row 2** — Total Price Return · IRR (XIRR) · TWR · Dividend Yield (TTM)
- **Total Portfolio Value Over Time** — bar chart with selectable benchmark (S&P 500, MSCI World, NASDAQ 100), USD value line, and MoM growth % on a secondary axis
- **IRR vs TWR Over Time** — line chart with coloured fill between the two metrics (green = IRR > TWR → your timing added alpha; red = TWR > IRR → market ran ahead of your contributions) plus the benchmark annualised return for direct comparison
- **Total Positions & Avg Position Size** — side-by-side line charts over time
- **Avg Holding Period & Holding Period by Company** — FIFO-based, portfolio and per-position
- **Portfolio Allocation** — pie + grouped bar chart (current weights vs. targets)
- **Holdings Detail Table** — per-position: Shares · Price · Market Value · Net Invested · All-time Perf · Period Change · Price Delta · Shares Delta · Weight · Target Weight · Diff to Target · Holding Period; includes a "Compare statements" toggle for side-by-side diff
- **Position Drill-down Panel** — click any stock chip below the holdings table to open a full inline analytics panel:
  - *Tier 1 — KPIs*: Market Value · Shares · Net Invested · All-time Perf · Unrealised P&L · Realised P&L · Dividends · Avg Cost Basis
  - *Tier 2 — Charts*: Price vs. cost basis with benchmark overlay · Portfolio weight over time · Value change decomposition · Cumulative price effect · Cumulative net invested · Price per share · Shares over time
  - *Tier 3 — Tables*: Full transaction history · FIFO lot table (buy date, buy price, qty remaining, unrealised P&L)
- **Position Values Over Time** — stacked area chart, switchable to weight %
- **Monthly Overview Table** — period-by-period flow table (invested, proceeds, dividends, price effect, etc.)
- **Dividends & Interest** — bar charts by company and by month

### Portfolio Data Tab
- Full holdings history table with CSV export
- **Position Race** — animated horizontal bar chart racing market values across statement dates
- **Allocation Race** — animated donut chart showing how your allocation evolved

### Transactions Tab
- Filterable transaction table (by direction, ticker, date range) with CSV export
- Per-transaction: execution price, current price, FIFO cost basis, simple performance, FIFO P&L
- Approximated transactions (quantity derived from daily close) clearly marked with `~`

### Tax Tab (Kapitalertragssteuer)
- Year selector covering all years from 2025 onwards
- Configurable Freistellungsauftrag (default €1,000) with progress bar showing usage
- FIFO-accurate realized gains/losses for every sell event, using full transaction history as cost basis
- Dividends and interest as additional taxable income
- Summary: Gross Taxable → FSA deduction → Net Taxable → Estimated Tax at **26.375%** (25% KapESt + 5.5% Soli)
- Full taxable-events table sorted by date (sells, dividends, interest)

### Settings Tab
- Editable target allocation weights per position (persisted to database)
- Loaded statements management — view and delete individual statements

---

## Performance Metrics Explained

| Metric | Formula | Why it matters |
|--------|---------|----------------|
| **Total Price Return** | `(market value − net invested) / net invested` | How much prices have worked in your favour, free of timing distortion |
| **IRR (XIRR)** | Newton-Raphson on all buy/sell/dividend cash flows | Your actual annualised return — what your money truly earned |
| **TWR** | Product of sub-period returns, each adjusted for net flows | Timing-stripped, directly comparable to any benchmark |
| **Dividend Yield (TTM)** | `trailing 12-month dividends / average portfolio value` | Income return from dividends over the past year |
| **IRR − TWR spread** | Visible in the chart fill | Positive = your contribution timing added alpha; negative = market outpaced your deployment |

---

## Setup

### Prerequisites
- Python 3.11+
- pip

### Install

```bash
git clone https://github.com/mauricevernier10/account-tracker-streamlit.git
cd account-tracker-streamlit
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
pip install pdfplumber          # PDF parsing dependency
```

### Run

```bash
streamlit run dashboard.py
```

The app opens at `http://localhost:8501`.

---

## Adding Your Data

### Folder structure

```
account-tracker-streamlit/
├── raw data/          ← drop Trade Republic "Depotauszug" PDFs here
├── transactions/      ← drop Trade Republic account statement PDFs here
└── output/
    └── portfolio.db   ← SQLite database (auto-created)
```

### Workflow

1. Download your **Depotauszug** (portfolio statement) PDF from Trade Republic and drop it into `raw data/`.
2. Download your **Kontoauszug** (account/transaction statement) PDF from Trade Republic and drop it into `transactions/`.
3. On the next page load the app auto-detects new files and imports them. You can also use the **+ New Statement** button in the navigation bar to trigger import manually.

> **Note:** The app imports each PDF only once. Re-uploading the same file is safe — duplicate entries are silently ignored.

---

## Architecture

```
dashboard.py          Streamlit UI, tab rendering, charts assembly
data.py               All computations: FIFO, IRR/TWR, benchmarks, caching
charts.py             Reusable Plotly figure builders
db.py                 SQLite abstraction (holdings, transactions, targets)
parse_depot.py        PDF parser for portfolio statements (Depotauszug)
parse_transactions.py PDF parser for account statements (Kontoauszug)
constants.py          Design tokens, colour palette, exchange list
.streamlit/
  config.toml         Theme (blue accent, light background)
```

### Data flow

```
Trade Republic PDFs
       │
       ▼
parse_depot.py / parse_transactions.py
       │  pdfplumber text extraction + regex
       ▼
db.py (SQLite — holdings, transactions, targets)
       │
       ▼
data.py (pandas computations, @st.cache_data)
  ├─ FIFO lots & cost basis
  ├─ IRR (Newton-Raphson XIRR)
  ├─ TWR (sub-period product)
  ├─ Benchmark simulation (same cash flows vs. index)
  └─ Tax event extraction
       │
       ▼
dashboard.py  →  Plotly charts  →  Streamlit UI
```

### Caching layers

| Layer | Mechanism | Lifetime |
|-------|-----------|---------|
| Holdings & transactions | `@st.cache_data` | Process lifetime (clears on restart) |
| Benchmark price data | `@st.cache_data(ttl=24h)` | 24 hours |
| ISIN → ticker mapping | Disk JSON (`ticker_cache.json`) | Permanent (survives restarts) |

---

## Tax Calculation Details

The Tax tab implements **§ 43 EStG Kapitalertragssteuer**:

- **Rate**: 25% + 5.5% Solidaritätszuschlag = **26.375%**
- **Cost basis method**: FIFO (first-in, first-out) across full transaction history — even for stocks bought before 2025
- **Taxable events**: Realized gains from sells + dividends + interest
- **Loss netting**: Realized losses reduce gains within the same calendar year
- **Freistellungsauftrag**: Configurable (default €1,000 for singles); applied to net taxable income before tax calculation
- **Assumption**: Trade Republic withholds at source — the tab shows estimated amounts for your own records and tax-efficiency planning

> The tab does **not** handle Teilfreistellung for equity ETFs, Kirchensteuer, or foreign withholding tax credits. These may be added in future.

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `←` | Previous statement |
| `→` | Next statement |

---

## Tech Stack

| Library | Version | Use |
|---------|---------|-----|
| `streamlit` | 1.55 | UI framework |
| `pandas` | 2.0.3 | Data manipulation |
| `plotly` | 6.6 | Interactive charts |
| `yfinance` | 1.2 | Benchmark & ticker data |
| `pdfplumber` | latest | PDF text extraction |
| `sqlite3` | stdlib | Local database |

---

## Limitations & Known Caveats

- **Trade Republic only** — the PDF parsers are built for TR's specific statement format. Other brokers are not supported.
- **EUR-denominated** — all values displayed in EUR; USD value line uses live EUR/USD exchange rate.
- **Approximated transactions** — for older statements where quantity was not printed, the app estimates shares from the daily closing price. These are marked with `~` throughout.
- **TWR requires ≥ 2 statements** — single-statement portfolios show `—` for TWR and IRR.
- **yfinance availability** — ticker resolution for non-US-listed securities may occasionally fail; the ISIN is shown as a fallback.
- **Tax tab scope** — does not handle ETF Teilfreistellung, Kirchensteuer, or foreign withholding tax credits.

---

## Privacy

All data stays **100% local**. The only external calls are:
- `yfinance` for benchmark prices and ticker symbol resolution
- No data is sent to any server

---

## License

Personal use. No license for redistribution.

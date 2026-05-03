"""
Shared design tokens and constants for the Trade Republic Portfolio Dashboard.
"""

# ── Design tokens ────────────────────────────────────────────────────────────
BG = "#F8F9FA"
CARD_BG = "#FFFFFF"
TEXT = "#111827"
MUTED = "#6B7280"
ACCENT = "#2563EB"
POSITIVE = "#16A34A"
NEGATIVE = "#DC2626"
BORDER = "#E5E7EB"

# Chart palette: saturated but harmonious on light backgrounds
COLORS = [
    "#2563EB",  # blue
    "#16A34A",  # green
    "#D97706",  # amber
    "#7C3AED",  # violet
    "#DC2626",  # red
    "#0891B2",  # cyan
    "#EA580C",  # orange
    "#4F46E5",  # indigo
    "#059669",  # emerald
    "#BE185D",  # pink
]

# Benchmark overlay colors (lighter purple avoids collision with COLORS[3])
BM_COLORS = {
    "S&P 500":    "#0ea5e9",  # sky blue
    "MSCI World": "#a855f7",  # lighter purple
    "NASDAQ 100": "#f97316",  # orange
}

# Unified chart title font size
CHART_TITLE_SIZE = 13

# Unified font stack
FONT_STACK = "'Inter', system-ui, -apple-system, sans-serif"

# yfinance exchanges considered "primary" listings
_MAJOR_EXCHANGES = {"NYQ", "NMS", "NGM", "NCM", "PCX", "ASE", "BTS", "AMS"}

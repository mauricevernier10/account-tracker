"""
Reusable Plotly chart builders for the Trade Republic Portfolio Dashboard.

All functions return go.Figure instances; callers handle st.plotly_chart().
"""

import pandas as pd
import plotly.graph_objects as go

from constants import (
    ACCENT,
    BG,
    BORDER,
    CARD_BG,
    CHART_TITLE_SIZE,
    COLORS,
    FONT_STACK,
    MUTED,
    POSITIVE,
    TEXT,
)

# ── Margin presets ─────────────────────────────────────────────────────────────
MARGIN_STD     = dict(l=60, r=90,  t=40, b=70)   # most charts
MARGIN_WIDE    = dict(l=60, r=160, t=40, b=70)   # charts with end-labels
MARGIN_COMPACT = dict(l=20, r=80,  t=40, b=20)   # attribution bars

# ── Shared layout base ────────────────────────────────────────────────────────

_LAYOUT = dict(
    paper_bgcolor=CARD_BG,
    plot_bgcolor="rgba(248,249,250,0.5)",
    font=dict(
        color=TEXT, family=FONT_STACK, size=12
    ),
    xaxis=dict(
        gridcolor="#F3F4F6",
        linecolor=BORDER,
        tickfont=dict(color=MUTED, size=9),
        tickangle=-45,
        fixedrange=True,
        showspikes=True,
        spikecolor="#E5E7EB",
        spikethickness=1,
        spikesnap="cursor",
        spikedash="dot",
    ),
    yaxis=dict(
        gridcolor="#F3F4F6",
        linecolor=BORDER,
        tickfont=dict(color=MUTED),
        gridwidth=0.5,
        fixedrange=True,
    ),
    dragmode=False,
    margin=MARGIN_STD,
    hoverlabel=dict(bgcolor=CARD_BG, bordercolor=BORDER, font_color=TEXT),
    legend=dict(
        bgcolor="rgba(255,255,255,0)",
        bordercolor=BORDER,
        font=dict(color=TEXT, size=11),
    ),
)


def _layout(**overrides) -> dict:
    """Return base layout merged with overrides (one level deep)."""
    result = dict(_LAYOUT)
    for k, v in overrides.items():
        if isinstance(v, dict) and isinstance(result.get(k), dict):
            result[k] = {**result[k], **v}
        else:
            result[k] = v
    return result


# ── Small reusable helpers ────────────────────────────────────────────────────

def make_color_map(all_names: list[str]) -> dict[str, str]:
    """Assign a fixed color to each position name, sorted alphabetically."""
    names = sorted(set(all_names))
    return {name: COLORS[i % len(COLORS)] for i, name in enumerate(names)}


def _vline(fig: go.Figure, x) -> go.Figure:
    fig.add_vline(x=x.value / 1e6, line=dict(color=MUTED, width=1, dash="dash"))
    return fig


def _line_chart(
    x,
    y,
    color,
    *,
    height=280,
    margin=None,
    y_fmt="{:,.0f}",
    title=None,
    y_range=None,
    dtick=None,
    tick_suffix="",
    marker_size=6,
    end_label=None,
    xaxis_range=None,
) -> go.Figure:
    """Scatter line with a single end-label. Call _vline() + st.plotly_chart() after."""
    y_ser = y if isinstance(y, pd.Series) else pd.Series(list(y))
    labels = [""] * len(y_ser)
    labels[-1] = end_label if end_label is not None else y_fmt.format(y_ser.iloc[-1])
    fig = go.Figure(
        go.Scatter(
            x=x,
            y=y_ser,
            mode="lines+markers+text",
            text=labels,
            textposition="middle right",
            textfont=dict(color=color, size=10),
            cliponaxis=False,
            line=dict(color=color, width=2),
            marker=dict(size=marker_size),
            hovertemplate="%{x|%Y-%m-%d}<br><b>%{y:,.2f}</b><extra></extra>",
        )
    )
    yaxis_kw = dict(rangemode="tozero", range=y_range or [0, y_ser.max() * 1.2])
    if dtick is not None:
        yaxis_kw["dtick"] = dtick
    if tick_suffix:
        yaxis_kw["ticksuffix"] = tick_suffix
    _x_ser = x if isinstance(x, pd.Series) else pd.Series(list(x))
    _x_pad = pd.Timedelta(days=10)
    layout_kw = dict(
        height=height,
        margin=margin or MARGIN_WIDE,
        showlegend=False,
        yaxis=yaxis_kw,
        xaxis=dict(
            tickmode="linear",
            dtick="M1",
            tickformat="%b %y",
            range=xaxis_range or [_x_ser.min() - _x_pad, _x_ser.max() + _x_pad],
        ),
    )
    if title:
        layout_kw["title"] = dict(text=title, font=dict(size=CHART_TITLE_SIZE, color=TEXT), x=0)
    fig.update_layout(**_layout(**layout_kw))
    return fig


# ── Reusable chart builders ───────────────────────────────────────────────────

def cumulative_fill_chart(
    dates,
    values: list,
    label: str,
    color: str,
    fill_color: str,
    selected_date=None,
) -> go.Figure:
    """Area-fill line chart for cumulative price / investment effect."""
    labels = [""] * len(values)
    labels[-1] = f"{values[-1]:+,.0f} €"
    fig = go.Figure(
        go.Scatter(
            x=list(dates),
            y=values,
            mode="lines+markers+text",
            text=labels,
            textposition="middle right",
            textfont=dict(color=color, size=10),
            cliponaxis=False,
            line=dict(color=color, width=2),
            marker=dict(size=5),
            fill="tozeroy",
            fillcolor=fill_color,
            hovertemplate="%{x|%Y-%m-%d}<br><b>%{y:+,.0f} €</b><extra></extra>",
        )
    )
    fig.update_layout(
        **_layout(
            title=dict(text=label, font=dict(size=CHART_TITLE_SIZE, color=TEXT), x=0),
            height=260,
            margin=MARGIN_WIDE,
            showlegend=False,
            yaxis=dict(tickformat="+,.0f"),
        )
    )
    fig.update_xaxes(tickmode="array", tickvals=list(dates), tickformat="%b %y")
    if selected_date is not None:
        _vline(fig, selected_date)
    return fig


def _animation_controls(frames: list) -> dict:
    """Play/Pause buttons + timeline slider shared by animated charts."""
    return dict(
        updatemenus=[
            dict(
                type="buttons",
                showactive=False,
                x=0,
                y=-0.05,
                xanchor="left",
                buttons=[
                    dict(
                        label="▶  Play",
                        method="animate",
                        args=[
                            None,
                            dict(
                                frame=dict(duration=700, redraw=True),
                                fromcurrent=True,
                                transition=dict(duration=500, easing="cubic-in-out"),
                            ),
                        ],
                    ),
                    dict(
                        label="⏸  Pause",
                        method="animate",
                        args=[
                            [None],
                            dict(frame=dict(duration=0, redraw=False), mode="immediate"),
                        ],
                    ),
                ],
            )
        ],
        sliders=[
            dict(
                steps=[
                    dict(
                        method="animate",
                        args=[
                            [f.name],
                            dict(
                                mode="immediate",
                                frame=dict(duration=700, redraw=True),
                                transition=dict(duration=500),
                            ),
                        ],
                        label=f.name,
                    )
                    for f in frames
                ],
                transition=dict(duration=500),
                x=0,
                y=0,
                len=1.0,
                currentvalue=dict(
                    prefix="",
                    visible=True,
                    xanchor="center",
                    font=dict(size=12, color=MUTED),
                ),
                pad=dict(t=50),
            )
        ],
    )


def animated_bar_race(
    df_all: pd.DataFrame,
    all_dates: list,
    color_map: dict,
) -> go.Figure:
    """Animated horizontal bar chart racing positions by market value."""
    universe = sorted(df_all["name"].unique())
    global_max = df_all["market_value_eur"].max()

    def _frame_vals(d):
        return (
            df_all[df_all["statement_date"] == d]
            .set_index("name")["market_value_eur"]
            .reindex(universe, fill_value=0)
            .sort_values(ascending=True)
        )

    def _bar(vals):
        return go.Bar(
            x=vals.values,
            y=vals.index.tolist(),
            orientation="h",
            marker_color=[color_map.get(n, MUTED) for n in vals.index],
            text=[f"{v:,.0f} €" if v > 0 else "" for v in vals.values],
            textposition="outside",
            textfont=dict(color=TEXT, size=11),
            hovertemplate="<b>%{y}</b><br>%{x:,.0f} €<extra></extra>",
        )

    frames = []
    for d in all_dates:
        vals = _frame_vals(d)
        frames.append(
            go.Frame(
                data=[_bar(vals)],
                layout=go.Layout(
                    yaxis=dict(
                        categoryorder="array", categoryarray=vals.index.tolist()
                    ),
                    title=dict(
                        text=f"Market Value per Position — {pd.Timestamp(d).strftime('%b %Y')}",
                        font=dict(size=CHART_TITLE_SIZE, color=TEXT),
                        x=0,
                    ),
                ),
                name=pd.Timestamp(d).strftime("%b %Y"),
            )
        )

    vals_first = _frame_vals(all_dates[0])
    fig = go.Figure(data=[_bar(vals_first)], frames=frames)
    fig.update_layout(
        **_layout(
            height=max(400, len(universe) * 46),
            margin=dict(l=60, r=80, t=50, b=20),
            title=dict(
                text=f"Market Value per Position — {pd.Timestamp(all_dates[0]).strftime('%b %Y')}",
                font=dict(size=CHART_TITLE_SIZE, color=TEXT),
                x=0,
            ),
            xaxis=dict(range=[0, global_max * 1.35], visible=False),
            yaxis=dict(
                categoryorder="array",
                categoryarray=vals_first.index.tolist(),
                tickfont=dict(color=TEXT),
            ),
            bargap=0.3,
            **_animation_controls(frames),
        )
    )
    return fig


def animated_pie_race(
    df_all: pd.DataFrame,
    all_dates: list,
    color_map: dict,
) -> go.Figure:
    """Animated donut chart racing portfolio allocation over time."""
    # Fix slice order by total value across all statements (largest first)
    # so each name always maps to the same slice index across frames.
    pie_order = (
        df_all.groupby("name")["market_value_eur"]
        .sum()
        .sort_values(ascending=False)
        .index.tolist()
    )
    pie_colors = [color_map.get(n, MUTED) for n in pie_order]

    def _frame_vals(d):
        return (
            df_all[df_all["statement_date"] == d]
            .set_index("name")["market_value_eur"]
            .reindex(pie_order, fill_value=0)
        )

    def _pie(vals):
        return go.Pie(
            labels=pie_order,
            values=vals.values,
            marker=dict(colors=pie_colors, line=dict(color=CARD_BG, width=2)),
            hole=0.45,
            textinfo="label+percent",
            textfont=dict(size=11),
            hovertemplate="<b>%{label}</b><br>€%{value:,.0f}<br>%{percent}<extra></extra>",
            direction="clockwise",
            sort=False,
        )

    frames = []
    for d in all_dates:
        vals = _frame_vals(d)
        frames.append(
            go.Frame(
                data=[_pie(vals)],
                layout=go.Layout(
                    title=dict(
                        text=f"Portfolio Allocation — {pd.Timestamp(d).strftime('%b %Y')}",
                        font=dict(size=CHART_TITLE_SIZE, color=TEXT),
                        x=0,
                    )
                ),
                name=pd.Timestamp(d).strftime("%b %Y"),
            )
        )

    fig = go.Figure(data=[_pie(_frame_vals(all_dates[0]))], frames=frames)
    fig.update_layout(
        **_layout(
            height=500,
            margin=dict(l=20, r=20, t=50, b=20),
            title=dict(
                text=f"Portfolio Allocation — {pd.Timestamp(all_dates[0]).strftime('%b %Y')}",
                font=dict(size=CHART_TITLE_SIZE, color=TEXT),
                x=0,
            ),
            showlegend=False,
            **_animation_controls(frames),
        )
    )
    return fig

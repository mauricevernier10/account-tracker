"use client";

import { useState, useRef, useEffect, type CSSProperties } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";

interface Contributor {
  name: string;
  effect: number;
}

export interface DecompositionDataPoint {
  date: string;
  label: string;
  value: number;
  netInvested: number;
  priceEffect: number;
  // null = "No prior period" (first statement, no price-effect breakdown)
  priceContributors: Contributor[] | null;
  investContributors: Contributor[];
}

interface Props {
  data: DecompositionDataPoint[];
  selectedDate?: string | null;
}

// Streamlit reference palette (constants.py)
const C_TEXT = "#111827";
const C_MUTED = "#6B7280";
const C_BORDER = "#E5E7EB";
const C_ACCENT = "#2563EB";   // net invested positive
const C_AMBER = "#D97706";    // net invested negative
const C_POSITIVE = "#16A34A"; // price effect positive
const C_NEGATIVE = "#DC2626"; // price effect negative

function fmtSigned(n: number) {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return sign + new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(Math.abs(n)) + " €";
}

function fmtAbs(n: number) {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(n) + " €";
}

type HoverKind = "price" | "invest" | "value" | "combined";
interface Hover {
  kind: HoverKind;
  index: number;
  x: number;
  y: number;
}

function ContributorList({ items, posColor, negColor }: { items: Contributor[]; posColor: string; negColor: string }) {
  return (
    <>
      {items.map((c, i) => (
        <div key={i} className="flex justify-between gap-4">
          <span style={{ color: C_MUTED }} className="truncate">{c.name}</span>
          <span
            className="font-medium tabular-nums shrink-0"
            style={{ color: c.effect >= 0 ? posColor : negColor }}
          >
            {fmtSigned(c.effect)}
          </span>
        </div>
      ))}
    </>
  );
}

// Returns the period-end portion of a transition label, e.g.
//   "Mar 25 → Apr 25" → "Apr 25"
//   "Apr 2025"        → "Apr 2025"
function shortLabel(label: string): string {
  const parts = label.split("→").map((s) => s.trim());
  return parts[parts.length - 1];
}

function HoverCard({
  hover,
  data,
  containerWidth,
  compact,
  onDismiss,
}: {
  hover: Hover;
  data: DecompositionDataPoint[];
  containerWidth: number;
  compact: boolean;
  onDismiss: () => void;
}) {
  const d = data[hover.index];
  if (!d) return null;

  const totalChange = d.priceEffect + d.netInvested;
  const totalColor = totalChange >= 0 ? C_POSITIVE : C_NEGATIVE;

  let body: React.ReactNode;
  if (hover.kind === "combined") {
    body = (
      <>
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-semibold text-sm" style={{ color: C_TEXT }}>{d.label}</span>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="-mr-1 px-1.5 py-0.5 rounded text-base leading-none"
            style={{ color: C_MUTED, pointerEvents: "auto" }}
          >
            ×
          </button>
        </div>
        <div className="flex justify-between gap-6">
          <span style={{ color: C_MUTED }}>Portfolio value</span>
          <span className="font-semibold tabular-nums" style={{ color: C_TEXT }}>{fmtAbs(d.value)}</span>
        </div>
        {d.priceContributors !== null ? (
          <>
            <div className="flex justify-between gap-6 mt-1.5">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-sm" style={{ background: d.priceEffect >= 0 ? C_POSITIVE : C_NEGATIVE }} />
                <span style={{ color: C_MUTED }}>Price effect</span>
              </span>
              <span className="font-semibold tabular-nums" style={{ color: C_TEXT }}>{fmtSigned(d.priceEffect)}</span>
            </div>
            <div className="pl-3.5">
              <ContributorList items={d.priceContributors} posColor={C_POSITIVE} negColor={C_NEGATIVE} />
            </div>
            <div className="flex justify-between gap-6 mt-1.5">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-sm" style={{ background: d.netInvested >= 0 ? C_ACCENT : C_AMBER }} />
                <span style={{ color: C_MUTED }}>Net invested</span>
              </span>
              <span className="font-semibold tabular-nums" style={{ color: C_TEXT }}>{fmtSigned(d.netInvested)}</span>
            </div>
            <div className="pl-3.5">
              <ContributorList items={d.investContributors} posColor={C_ACCENT} negColor={C_AMBER} />
            </div>
            <div className="border-t mt-1.5 pt-1" style={{ borderColor: C_BORDER }} />
            <div className="flex justify-between gap-6">
              <span style={{ color: C_MUTED }}>Total change</span>
              <span className="font-semibold tabular-nums" style={{ color: totalColor }}>{fmtSigned(totalChange)}</span>
            </div>
          </>
        ) : (
          <p className="mt-1" style={{ color: C_MUTED }}>No prior period</p>
        )}
      </>
    );
  } else if (hover.kind === "value") {
    body = (
      <>
        {/* Header row: period label + swatch */}
        <div className="flex items-center gap-1.5 mb-1">
          <span className="inline-block h-2 w-2 rounded-full flex-shrink-0" style={{ background: C_TEXT }} />
          <span className="font-semibold" style={{ color: C_TEXT }}>{d.label}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span style={{ color: C_MUTED }}>Portfolio value</span>
          <span className="font-semibold tabular-nums" style={{ color: C_TEXT }}>{fmtAbs(d.value)}</span>
        </div>
        {d.priceContributors !== null && (
          <>
            <div className="flex justify-between gap-6">
              <span style={{ color: C_MUTED }}>Price effect</span>
              <span className="font-medium tabular-nums" style={{ color: d.priceEffect >= 0 ? C_POSITIVE : C_NEGATIVE }}>
                {fmtSigned(d.priceEffect)}
              </span>
            </div>
            <div className="flex justify-between gap-6">
              <span style={{ color: C_MUTED }}>Net invested</span>
              <span className="font-medium tabular-nums" style={{ color: d.netInvested >= 0 ? C_ACCENT : C_AMBER }}>
                {fmtSigned(d.netInvested)}
              </span>
            </div>
          </>
        )}
      </>
    );
  } else if (hover.kind === "price") {
    if (d.priceContributors === null) {
      body = (
        <>
          <div className="flex items-center gap-1.5 mb-1">
            <span className="inline-block h-2 w-2 rounded-sm flex-shrink-0" style={{ background: C_POSITIVE }} />
            <span className="font-semibold" style={{ color: C_TEXT }}>{d.label}</span>
          </div>
          <p style={{ color: C_MUTED }}>No prior period</p>
        </>
      );
    } else {
      const swatchColor = d.priceEffect >= 0 ? C_POSITIVE : C_NEGATIVE;
      body = (
        <>
          <div className="flex items-center gap-1.5 mb-1">
            <span className="inline-block h-2 w-2 rounded-sm flex-shrink-0" style={{ background: swatchColor }} />
            <span className="font-semibold" style={{ color: C_TEXT }}>{d.label}</span>
          </div>
          {/* Summary row */}
          <div className="flex justify-between gap-6">
            <span style={{ color: C_MUTED }}>Price effect</span>
            <span className="font-semibold tabular-nums" style={{ color: C_TEXT }}>{fmtSigned(d.priceEffect)}</span>
          </div>
          {/* Divider */}
          <div className="border-t my-1" style={{ borderColor: C_BORDER }} />
          {/* Per-position breakdown */}
          <ContributorList items={d.priceContributors} posColor={C_POSITIVE} negColor={C_NEGATIVE} />
        </>
      );
    }
  } else {
    const swatchColor = d.netInvested >= 0 ? C_ACCENT : C_AMBER;
    body = (
      <>
        <div className="flex items-center gap-1.5 mb-1">
          <span className="inline-block h-2 w-2 rounded-sm flex-shrink-0" style={{ background: swatchColor }} />
          <span className="font-semibold" style={{ color: C_TEXT }}>{d.label}</span>
        </div>
        {/* Summary row */}
        <div className="flex justify-between gap-6">
          <span style={{ color: C_MUTED }}>Net invested</span>
          <span className="font-semibold tabular-nums" style={{ color: C_TEXT }}>{fmtSigned(d.netInvested)}</span>
        </div>
        {/* Divider */}
        <div className="border-t my-1" style={{ borderColor: C_BORDER }} />
        {/* Per-position breakdown */}
        <ContributorList items={d.investContributors} posColor={C_ACCENT} negColor={C_AMBER} />
        {/* Total period change footer */}
        {d.priceContributors !== null && (
          <>
            <div className="border-t mt-1 pt-1" style={{ borderColor: C_BORDER }} />
            <div className="flex justify-between gap-6">
              <span style={{ color: C_MUTED }}>Total change</span>
              <span className="font-semibold tabular-nums" style={{ color: totalColor }}>{fmtSigned(totalChange)}</span>
            </div>
          </>
        )}
      </>
    );
  }

  // Combined (mobile) card is pinned to the top of the chart so it never
  // covers the data the user is inspecting. Otherwise floats next to the cursor.
  const isPinned = hover.kind === "combined";
  const cardWidth = compact ? 220 : 260;
  const flipX = hover.x + cardWidth + 28 > containerWidth;
  const style: CSSProperties = isPinned
    ? {
        position: "absolute",
        left: 8,
        right: 8,
        top: 8,
        pointerEvents: "none",
        zIndex: 30,
      }
    : {
        position: "absolute",
        left: flipX ? Math.max(4, hover.x - cardWidth - 14) : hover.x + 14,
        top: hover.y + 14,
        pointerEvents: "none",
        zIndex: 30,
        width: cardWidth,
      };

  return (
    <div style={style} className="rounded-lg border bg-white/95 backdrop-blur px-3 py-2.5 shadow-lg text-xs space-y-0.5">
      {body}
    </div>
  );
}

export default function ValueDecompositionChart({ data, selectedDate }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const ro = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  // Below ~640px we tighten labels, sparse the ticks and drop the inline
  // last-point value label so things stop colliding.
  const compact = containerWidth > 0 && containerWidth < 640;
  const targetTickCount = compact ? 6 : 13;
  const tickInterval = Math.max(0, Math.ceil(data.length / targetTickCount) - 1);

  // Display copy of the data with shortened labels on narrow viewports.
  const xData = compact ? data.map((d) => ({ ...d, label: shortLabel(d.label) })) : data;
  const xSelectedLabel = selectedDate
    ? xData.find((d) => d.date === selectedDate)?.label
    : undefined;

  // Streamlit: yaxis range = [0, max(values) * 1.3]
  const leftMax = Math.max(...data.map((d) => d.value));
  const leftDomain: [number, number] = [0, leftMax * 1.3];

  // Domain must cover all visible bar endpoints across both stacking modes.
  const stackBounds = data.flatMap((d) => {
    const pe = d.priceEffect;
    const ni = d.netInvested;
    return pe < 0 && ni > 0 ? [0, pe, ni] : [0, pe, pe + ni];
  });
  const rightMax = Math.max(...stackBounds, 0);
  const rightMin = Math.min(...stackBounds, 0);
  const rightPad = (rightMax - rightMin) * 0.18 || 500;
  const domainMin = rightMin - rightPad;
  const domainMax = rightMax + rightPad;

  function setHoverFromEvent(kind: HoverKind, index: number, ev: { clientX: number; clientY: number }) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({ kind, index, x: ev.clientX - rect.left, y: ev.clientY - rect.top });
  }

  // Render both colored segments (price + invest) inside one column-wide Bar
  // so they share the same x slot. Pixel positions are derived from the
  // background rect, which spans the full plot area for the column.
  function DecomposedBarShape(shapeProps: any) {
    const { x, width, payload, background, index } = shapeProps;
    if (!background || !payload) return null;
    const pe = payload.priceEffect as number;
    const ni = payload.netInvested as number;
    const bgY = background.y as number;
    const bgH = background.height as number;
    const toY = (v: number) => bgY + (bgH * (domainMax - v)) / (domainMax - domainMin);

    const y0 = toY(0);
    const yPe = toY(pe);
    const signSeparated = pe < 0 && ni > 0;

    let priceRect: { y: number; h: number } | null = null;
    let investRect: { y: number; h: number } | null = null;
    if (signSeparated) {
      priceRect = { y: y0, h: yPe - y0 };
      const yNi = toY(ni);
      investRect = { y: yNi, h: y0 - yNi };
    } else {
      const yTotal = toY(pe + ni);
      priceRect = { y: Math.min(y0, yPe), h: Math.abs(yPe - y0) };
      investRect = { y: Math.min(yPe, yTotal), h: Math.abs(yTotal - yPe) };
    }
    const peColor = pe >= 0 ? C_POSITIVE : C_NEGATIVE;
    const niColor = ni >= 0 ? C_ACCENT : C_AMBER;

    return (
      <g>
        {priceRect.h > 0 && (
          <rect x={x} y={priceRect.y} width={width} height={priceRect.h} fill={peColor} />
        )}
        {investRect.h > 0 && (
          <rect x={x} y={investRect.y} width={width} height={investRect.h} fill={niColor} />
        )}
        {/* Desktop only: transparent hover overlays per segment.
            On compact, the chart-level onClick handler covers targeting. */}
        {!compact && priceRect.h > 0 && (
          <rect
            x={x}
            y={priceRect.y}
            width={width}
            height={priceRect.h}
            fill="transparent"
            style={{ cursor: "pointer" }}
            onMouseEnter={(ev) => setHoverFromEvent("price", index, ev)}
            onMouseMove={(ev) => setHoverFromEvent("price", index, ev)}
            onMouseLeave={() => setHover(null)}
          />
        )}
        {!compact && investRect.h > 0 && (
          <rect
            x={x}
            y={investRect.y}
            width={width}
            height={investRect.h}
            fill="transparent"
            style={{ cursor: "pointer" }}
            onMouseEnter={(ev) => setHoverFromEvent("invest", index, ev)}
            onMouseMove={(ev) => setHoverFromEvent("invest", index, ev)}
            onMouseLeave={() => setHover(null)}
          />
        )}
      </g>
    );
  }

  // On compact, any tap inside the plot area opens the combined panel for
  // the nearest period; tapping the same period toggles it off.
  function handleChartClick(state: { activeTooltipIndex?: number | null } | null) {
    if (!compact || !state) return;
    const idx = state.activeTooltipIndex;
    if (idx == null || idx < 0) return;
    setHover((prev) =>
      prev && prev.kind === "combined" && prev.index === idx
        ? null
        : { kind: "combined", index: idx, x: 0, y: 0 }
    );
  }

  return (
    <div ref={containerRef} className="relative" onMouseLeave={() => setHover(null)}>
      <ResponsiveContainer width="100%" height={compact ? 320 : 360}>
        <ComposedChart
          data={xData}
          margin={{ top: 16, right: compact ? 12 : 72, left: compact ? 0 : 24, bottom: 0 }}
          onClick={compact ? (handleChartClick as any) : undefined}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={C_BORDER} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: compact ? 10 : 9, fill: C_MUTED }}
            axisLine={false}
            tickLine={false}
            interval={tickInterval}
            angle={-45}
            textAnchor="end"
            height={compact ? 56 : 80}
          />
          <YAxis
            yAxisId="left"
            tickFormatter={(v) => "€" + (v / 1000).toFixed(0) + "k"}
            tick={{ fontSize: 10, fill: C_MUTED }}
            axisLine={false}
            tickLine={false}
            width={compact ? 44 : 60}
            domain={leftDomain}
            label={
              compact
                ? undefined
                : {
                    value: "Total value (€)",
                    angle: -90,
                    position: "insideLeft",
                    style: { fontSize: 10, fill: C_MUTED, textAnchor: "middle" },
                    offset: 0,
                  }
            }
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tickFormatter={(v) => (v === 0 ? "0" : (v > 0 ? "+" : "−") + "€" + Math.abs(v / 1000).toFixed(0) + "k")}
            tick={{ fontSize: 10, fill: C_MUTED }}
            axisLine={false}
            tickLine={false}
            width={compact ? 48 : 64}
            domain={[rightMin - rightPad, rightMax + rightPad]}
            label={
              compact
                ? undefined
                : {
                    value: "Period change (€)",
                    angle: 90,
                    position: "insideRight",
                    style: { fontSize: 10, fill: C_MUTED, textAnchor: "middle" },
                    offset: 0,
                  }
            }
          />
          {/* Disable Recharts' own tooltip; we render our own absolute card. */}
          <Tooltip content={() => null} cursor={false} />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
            content={() => (
              <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 pt-1.5 text-[11px]">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: C_ACCENT }} />
                  Net invested
                </span>
                <span className="inline-flex items-center gap-1.5">
                  {/* Split swatch: left half green (positive), right half red (negative) */}
                  <svg width="10" height="10" className="inline-block rounded-sm overflow-hidden flex-shrink-0">
                    <rect x="0" y="0" width="5" height="10" fill={C_POSITIVE} />
                    <rect x="5" y="0" width="5" height="10" fill={C_NEGATIVE} />
                  </svg>
                  Price effect
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <svg width="18" height="6" className="inline-block">
                    <line x1="0" y1="3" x2="18" y2="3" stroke={C_TEXT} strokeWidth="1.5" strokeDasharray="3 3" />
                  </svg>
                  Total value
                </span>
              </div>
            )}
          />
          <ReferenceLine yAxisId="right" y={0} stroke={C_BORDER} />
          {xSelectedLabel && (
            <ReferenceLine
              yAxisId="left"
              x={xSelectedLabel}
              stroke={C_MUTED}
              strokeDasharray="4 3"
              strokeOpacity={0.6}
            />
          )}
          {/* Highlight the currently-selected column on mobile */}
          {compact && hover?.kind === "combined" && xData[hover.index] && (
            <ReferenceLine
              yAxisId="left"
              x={xData[hover.index].label}
              stroke={C_TEXT}
              strokeOpacity={0.35}
              strokeWidth={1.5}
            />
          )}

          {/* Single column-wide bar with custom shape that draws both
              colored segments — guarantees same-x stacking. */}
          <Bar
            yAxisId="right"
            dataKey="priceEffect"
            name="decomposed"
            shape={DecomposedBarShape as any}
            isAnimationActive={false}
            legendType="none"
          />

          <Line
            yAxisId="left"
            type="linear"
            dataKey="value"
            name="value"
            stroke={C_TEXT}
            strokeWidth={1.5}
            strokeDasharray="3 3"
            dot={(dotProps: any) => {
              const { cx, cy, index } = dotProps;
              const isLast = index === data.length - 1;
              const dotEvents = compact
                ? {}
                : {
                    onMouseEnter: (ev: React.MouseEvent) => setHoverFromEvent("value", index, ev),
                    onMouseMove: (ev: React.MouseEvent) => setHoverFromEvent("value", index, ev),
                    onMouseLeave: () => setHover(null),
                  };
              return (
                <g key={index} {...dotEvents} style={{ cursor: compact ? "default" : "pointer" }}>
                  {/* Larger transparent hit-area for easier hover (desktop only) */}
                  {!compact && <circle cx={cx} cy={cy} r={8} fill="transparent" />}
                  <circle cx={cx} cy={cy} r={isLast ? 4 : 2.5} fill={C_TEXT} />
                  {isLast && !compact && (
                    <text
                      x={cx + 6}
                      y={cy + 3}
                      textAnchor="start"
                      fontSize={10}
                      fill={C_TEXT}
                      fontWeight={600}
                    >
                      {fmtAbs(dotProps.payload.value)}
                    </text>
                  )}
                </g>
              );
            }}
            activeDot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      {hover && (
        <HoverCard
          hover={hover}
          data={data}
          containerWidth={containerWidth}
          compact={compact}
          onDismiss={() => setHover(null)}
        />
      )}
    </div>
  );
}

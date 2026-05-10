"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

const C_TEXT = "#111827";
const C_MUTED = "#6B7280";
const C_BORDER = "#E5E7EB";
const C_ACCENT = "#2563EB"; // net invested positive (capital deployed)
const C_AMBER = "#D97706"; // net invested negative (proceeds withdrawn)
const C_POSITIVE = "#16A34A"; // price effect gain
const C_NEGATIVE = "#DC2626"; // price effect loss

export interface AttributionRow {
  name: string;
  priceEffect: number;
  investEffect: number;
  total: number;
}

interface Props {
  data: AttributionRow[];
}

function fmtSigned(n: number) {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  const abs = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(Math.abs(n));
  return sign + abs + " €";
}

interface Hover {
  index: number;
  x: number;
  y: number;
}

function HoverCard({
  hover,
  data,
  containerWidth,
}: {
  hover: Hover;
  data: AttributionRow[];
  containerWidth: number;
}) {
  const r = data[hover.index];
  if (!r) return null;
  const cardWidth = 240;
  const flipX = hover.x + cardWidth + 28 > containerWidth;
  const style: CSSProperties = {
    position: "absolute",
    left: flipX ? Math.max(4, hover.x - cardWidth - 14) : hover.x + 14,
    top: hover.y + 14,
    pointerEvents: "none",
    zIndex: 30,
    width: cardWidth,
  };
  return (
    <div style={style} className="rounded-lg border bg-white/95 backdrop-blur px-3 py-2.5 shadow-lg text-xs space-y-0.5">
      <div className="font-semibold text-sm mb-1.5" style={{ color: C_TEXT }}>{r.name}</div>
      <div className="flex justify-between gap-6">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: r.priceEffect >= 0 ? C_POSITIVE : C_NEGATIVE }} />
          <span style={{ color: C_MUTED }}>Price effect</span>
        </span>
        <span className="font-medium tabular-nums" style={{ color: C_TEXT }}>{fmtSigned(r.priceEffect)}</span>
      </div>
      <div className="flex justify-between gap-6">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: r.investEffect >= 0 ? C_ACCENT : C_AMBER }} />
          <span style={{ color: C_MUTED }}>Net invested</span>
        </span>
        <span className="font-medium tabular-nums" style={{ color: C_TEXT }}>{fmtSigned(r.investEffect)}</span>
      </div>
      <div className="border-t mt-1 pt-1" style={{ borderColor: C_BORDER }} />
      <div className="flex justify-between gap-6">
        <span style={{ color: C_MUTED }}>Total change</span>
        <span className="font-semibold tabular-nums" style={{ color: r.total >= 0 ? C_POSITIVE : C_NEGATIVE }}>
          {fmtSigned(r.total)}
        </span>
      </div>
    </div>
  );
}

export default function PositionAttributionChart({ data }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [hover, setHover] = useState<Hover | null>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const ro = new ResizeObserver((entries) => setContainerWidth(entries[0].contentRect.width));
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const compact = containerWidth > 0 && containerWidth < 640;

  // Drop rows with no meaningful contribution (below 1 € of absolute total).
  const filtered = data.filter((r) => Math.abs(r.total) >= 1 || Math.abs(r.priceEffect) >= 1 || Math.abs(r.investEffect) >= 1);
  // Winners on top, losers at bottom.
  const sorted = [...filtered].sort((a, b) => b.total - a.total);

  if (!sorted.length) {
    return (
      <div className="text-xs text-muted-foreground py-8 text-center">
        No position contributions in the selected window.
      </div>
    );
  }

  // Domain covers all bar endpoints (including the sign-separated case).
  const allValues = sorted.flatMap((r) => {
    const signSeparated = r.priceEffect < 0 && r.investEffect > 0;
    return signSeparated
      ? [0, r.priceEffect, r.investEffect]
      : [0, r.priceEffect, r.priceEffect + r.investEffect];
  });
  const xMax = Math.max(...allValues, 0);
  const xMin = Math.min(...allValues, 0);
  // Reserve extra padding on both sides for the total labels.
  const span = xMax - xMin || 1;
  const domainMin = xMin - span * 0.22;
  const domainMax = xMax + span * 0.22;

  const rowHeight = compact ? 26 : 32;
  const chartHeight = Math.max(220, sorted.length * rowHeight + 56);

  function setHoverFromEvent(index: number, ev: { clientX: number; clientY: number }) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({ index, x: ev.clientX - rect.left, y: ev.clientY - rect.top });
  }

  function AttributionBarShape(shapeProps: {
    y?: number;
    height?: number;
    index?: number;
    payload?: AttributionRow;
    background?: { x: number; y: number; width: number; height: number };
  }) {
    const { y, height, payload, background, index } = shapeProps;
    if (!background || !payload || y == null || height == null || index == null) return null;
    const pe = payload.priceEffect;
    const ie = payload.investEffect;
    const total = pe + ie;
    const bgX = background.x;
    const bgW = background.width;
    const toX = (v: number) => bgX + (bgW * (v - domainMin)) / (domainMax - domainMin);

    const x0 = toX(0);
    const xPe = toX(pe);
    const signSeparated = pe < 0 && ie > 0;

    let priceRect: { x: number; w: number };
    let investRect: { x: number; w: number };
    if (signSeparated) {
      priceRect = { x: xPe, w: x0 - xPe };
      const xIe = toX(ie);
      investRect = { x: x0, w: xIe - x0 };
    } else {
      const xTotal = toX(pe + ie);
      priceRect = { x: Math.min(x0, xPe), w: Math.abs(xPe - x0) };
      investRect = { x: Math.min(xPe, xTotal), w: Math.abs(xTotal - xPe) };
    }
    const peColor = pe >= 0 ? C_POSITIVE : C_NEGATIVE;
    const ieColor = ie >= 0 ? C_ACCENT : C_AMBER;

    // Total label sits just outside the bar's far edge.
    let labelX: number;
    let labelAnchor: "start" | "end";
    if (signSeparated) {
      const farRight = Math.max(xPe + priceRect.w, investRect.x + investRect.w);
      labelX = farRight + 6;
      labelAnchor = "start";
    } else if (total >= 0) {
      labelX = toX(total) + 6;
      labelAnchor = "start";
    } else {
      labelX = toX(total) - 6;
      labelAnchor = "end";
    }
    const yMid = y + height / 2 + 3.5;

    return (
      <g>
        {priceRect.w > 0 && (
          <rect x={priceRect.x} y={y} width={priceRect.w} height={height} fill={peColor} rx={2} />
        )}
        {investRect.w > 0 && (
          <rect x={investRect.x} y={y} width={investRect.w} height={height} fill={ieColor} rx={2} />
        )}
        <text x={labelX} y={yMid} textAnchor={labelAnchor} fontSize={11} fontWeight={600} fill={total >= 0 ? C_POSITIVE : C_NEGATIVE}>
          {fmtSigned(total)}
        </text>
        {/* Transparent hover overlay across the full row */}
        <rect
          x={background.x}
          y={y - (rowHeight - height) / 2}
          width={background.width}
          height={rowHeight}
          fill="transparent"
          style={{ cursor: "pointer" }}
          onMouseEnter={(ev) => setHoverFromEvent(index, ev)}
          onMouseMove={(ev) => setHoverFromEvent(index, ev)}
          onMouseLeave={() => setHover(null)}
        />
      </g>
    );
  }

  const yAxisWidth = compact ? 70 : 100;

  return (
    <div ref={containerRef} className="relative" onMouseLeave={() => setHover(null)}>
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={sorted}
          layout="vertical"
          margin={{ top: 8, right: compact ? 8 : 16, left: compact ? 0 : 8, bottom: 8 }}
          barCategoryGap="20%"
        >
          <CartesianGrid horizontal={false} stroke={C_BORDER} strokeDasharray="3 3" />
          <XAxis
            type="number"
            domain={[domainMin, domainMax]}
            tickFormatter={(v) => (v === 0 ? "0" : (v > 0 ? "+" : "−") + "€" + Math.abs(v / 1000).toFixed(0) + "k")}
            tick={{ fontSize: 10, fill: C_MUTED }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: compact ? 10 : 11, fill: C_TEXT }}
            axisLine={false}
            tickLine={false}
            width={yAxisWidth}
            interval={0}
          />
          <ReferenceLine x={0} stroke={C_BORDER} strokeWidth={1.5} />
          <Tooltip cursor={false} content={() => null} />
          <Bar
            dataKey="priceEffect"
            shape={AttributionBarShape as never}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
      {hover && <HoverCard hover={hover} data={sorted} containerWidth={containerWidth} />}
    </div>
  );
}

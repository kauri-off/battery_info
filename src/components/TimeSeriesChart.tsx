// TimeSeriesChart.tsx — the one chart component all three panels use, so axes,
// grid, crosshair and tooltip are identical everywhere.

import { useId } from "react";
import {
	Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine,
	ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { fmtClock, fmtStamp, roundSmart } from "../lib/format";
import type { BatteryRow } from "../lib/types";

type Props = {
	rows: BatteryRow[];
	/** Which normalized field to plot. */
	field: "pct" | "mA" | "tempC";
	/** CSS custom property holding the series color. */
	colorVar: string;
	unit: string;
	yDomain?: [number, number];
	/** Signed measure: split the fill at zero and draw a zero baseline. */
	diverging?: boolean;
	/** Hold the previous render at reduced opacity during a refetch. */
	stale?: boolean;
};

// Clean tick positions: the smallest round interval that keeps the axis to a
// handful of ticks, aligned to local wall-clock boundaries.
const TICK_STEPS = [300, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400];

function timeTicks(min: number, max: number, target = 4): number[] {
	const span = Math.max(1, max - min);
	const step = TICK_STEPS.find((s) => span / s <= target) ?? TICK_STEPS[TICK_STEPS.length - 1]!;
	// Epoch multiples land on UTC boundaries; shift so they land on local ones.
	const shift = -new Date(max * 1000).getTimezoneOffset() * 60;
	const ticks: number[] = [];
	for (let t = Math.ceil((min - shift) / step) * step + shift; t <= max; t += step) {
		ticks.push(t);
	}
	return ticks;
}

type TooltipRow = { value: number | null };

// Timestamp and value only: there is one series per card and its name is
// already in the card header, so a swatch and label would just repeat it.
function ChartTooltip({ active, payload, unit }: {
	active?: boolean;
	payload?: TooltipRow[];
	unit: string;
}) {
	const point = payload?.[0];
	if (!active || !point || point.value === null || point.value === undefined) return null;
	const stamp = (point as TooltipRow & { payload?: BatteryRow }).payload?.t;

	return (
		<div className="rounded-lg border border-hairline bg-surface px-3 py-2 shadow-lg">
			{stamp !== undefined && (
				<div className="mb-1 text-[11px] text-muted tabular-nums">{fmtStamp(stamp)}</div>
			)}
			<div className="text-base font-semibold text-ink tabular-nums">
				{roundSmart(point.value)}{unit}
			</div>
		</div>
	);
}

export function TimeSeriesChart({
	rows, field, colorVar, unit, yDomain, diverging, stale,
}: Props) {
	const gradientId = useId().replace(/:/g, "");
	const color = `var(${colorVar})`;

	if (!rows.length) {
		return (
			<div className="flex h-45 items-center justify-center text-sm text-muted">
				No samples in this range
			</div>
		);
	}

	const first = rows[0]!;
	const last = rows[rows.length - 1]!;
	const values = rows.map((r) => r[field]).filter((v): v is number => v !== null);
	const lastValue = last[field];

	// Split the fill at the zero crossing so charging and discharging read as
	// opposite states, not one continuous magnitude.
	let splitOffset = 1;
	if (diverging && values.length) {
		const max = Math.max(...values, 0);
		const min = Math.min(...values, 0);
		splitOffset = max <= 0 ? 0 : min >= 0 ? 1 : max / (max - min);
	}

	return (
		<div
			className="h-45 transition-opacity duration-200"
			style={{ opacity: stale ? 0.6 : 1 }}
		>
			<ResponsiveContainer width="100%" height="100%">
				{/* accessibilityLayer would put tabIndex=0 on the SVG; there is no
				    keyboard in this WebView, only a focus ring on every tap. */}
				<AreaChart
					data={rows}
					margin={{ top: 6, right: 10, bottom: 0, left: 0 }}
					accessibilityLayer={false}
				>
					<defs>
						<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
							{diverging ? (
								<>
									<stop offset={0} stopColor="var(--color-pos)" stopOpacity={0.18} />
									<stop offset={splitOffset} stopColor="var(--color-pos)" stopOpacity={0.02} />
									<stop offset={splitOffset} stopColor="var(--color-neg)" stopOpacity={0.02} />
									<stop offset={1} stopColor="var(--color-neg)" stopOpacity={0.18} />
								</>
							) : (
								<>
									<stop offset={0} stopColor={color} stopOpacity={0.16} />
									<stop offset={1} stopColor={color} stopOpacity={0.02} />
								</>
							)}
						</linearGradient>
					</defs>

					<CartesianGrid
						stroke="var(--color-grid)"
						strokeWidth={1}
						vertical={false}
					/>
					<XAxis
						dataKey="t"
						type="number"
						domain={[first.t, last.t]}
						ticks={timeTicks(first.t, last.t)}
						tickFormatter={fmtClock}
						tickLine={false}
						axisLine={{ stroke: "var(--color-axis)" }}
						tick={{ fill: "var(--color-muted)", fontSize: 11 }}
						className="tabular-nums"
						minTickGap={16}
					/>
					<YAxis
						width={44}
						domain={yDomain ?? ["auto", "auto"]}
						tickFormatter={(v: number) => String(roundSmart(v))}
						tickLine={false}
						axisLine={false}
						tick={{ fill: "var(--color-muted)", fontSize: 11 }}
						className="tabular-nums"
					/>
					{diverging && (
						<ReferenceLine y={0} stroke="var(--color-axis)" strokeWidth={1} />
					)}
					<Tooltip
						cursor={{ stroke: "var(--color-axis)", strokeWidth: 1 }}
						content={<ChartTooltip unit={unit} />}
						isAnimationActive={false}
					/>
					<Area
						type="monotone"
						dataKey={field}
						stroke={color}
						strokeWidth={2}
						strokeLinecap="round"
						strokeLinejoin="round"
						fill={`url(#${gradientId})`}
						connectNulls={false}
						dot={false}
						activeDot={{ r: 4, fill: color, stroke: "var(--color-surface)", strokeWidth: 2 }}
						isAnimationActive={false}
					/>
					{/* End marker: a surface-ringed dot anchoring "now" on the line. */}
					{lastValue !== null && (
						<ReferenceDot
							x={last.t}
							y={lastValue}
							r={4}
							fill={color}
							stroke="var(--color-surface)"
							strokeWidth={2}
						/>
					)}
				</AreaChart>
			</ResponsiveContainer>
		</div>
	);
}

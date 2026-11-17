import { useId } from "react";
import {
	Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine,
	ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { fmtStamp, roundSmart } from "../lib/format";
import { tickLabel, timeTicks } from "../lib/ticks";
import type { Sample } from "../lib/types";

type Props = {
	rows: Sample[];
	field: "pct" | "mA" | "tempC";
	/** Time axis bounds in epoch seconds; gaps in the log stay visible as gaps. */
	domain: [number, number];
	/** CSS custom property holding the series color. */
	colorVar: string;
	unit: string;
	yDomain?: [number, number];
	/** Signed measure: split the fill at zero and draw a zero baseline. */
	diverging?: boolean;
	/** The rows belong to a window that is being replaced. */
	stale?: boolean;
};

function ChartTooltip({ active, payload, unit }: {
	active?: boolean;
	payload?: { value: number | null; payload?: Sample }[];
	unit: string;
}) {
	const point = payload?.[0];
	if (!active || !point || point.value === null || point.value === undefined) return null;
	return (
		<div className="rounded-lg border border-hairline bg-surface px-3 py-2 shadow-lg">
			{point.payload && (
				<div className="mb-1 text-[11px] text-muted tabular-nums">{fmtStamp(point.payload.t)}</div>
			)}
			<div className="text-base font-semibold text-ink tabular-nums">
				{roundSmart(point.value)}{unit}
			</div>
		</div>
	);
}

export function TimeSeriesChart({
	rows, field, domain, colorVar, unit, yDomain, diverging, stale,
}: Props) {
	const gradientId = useId().replace(/:/g, "");
	const color = `var(${colorVar})`;
	const values = rows.map((r) => r[field]).filter((v): v is number => v !== null);

	if (values.length < 2) {
		return (
			<div className="flex h-45 items-center justify-center text-sm text-muted">
				No samples in this range
			</div>
		);
	}

	const [from, to] = domain;
	const last = rows.findLast((r) => r[field] !== null)!;

	// Where zero falls in the fill, so charging and discharging read as opposites.
	let zeroAt = 1;
	if (diverging) {
		const max = Math.max(...values, 0);
		const min = Math.min(...values, 0);
		zeroAt = max <= 0 ? 0 : min >= 0 ? 1 : max / (max - min);
	}

	return (
		<div className="h-45 transition-opacity duration-200" style={{ opacity: stale ? 0.5 : 1 }}>
			<ResponsiveContainer width="100%" height="100%">
				{/* No accessibilityLayer: it leaves a focus ring behind every tap. */}
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
									<stop offset={zeroAt} stopColor="var(--color-pos)" stopOpacity={0.02} />
									<stop offset={zeroAt} stopColor="var(--color-neg)" stopOpacity={0.02} />
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

					<CartesianGrid stroke="var(--color-grid)" strokeWidth={1} vertical={false} />
					<XAxis
						dataKey="t"
						type="number"
						domain={domain}
						ticks={timeTicks(from, to)}
						tickFormatter={(t: number) => tickLabel(t, to - from)}
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
					{diverging && <ReferenceLine y={0} stroke="var(--color-axis)" strokeWidth={1} />}
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
						connectNulls
						dot={false}
						activeDot={{ r: 4, fill: color, stroke: "var(--color-surface)", strokeWidth: 2 }}
						isAnimationActive={false}
					/>
					<ReferenceDot
						x={last.t}
						y={last[field]!}
						r={4}
						fill={color}
						stroke="var(--color-surface)"
						strokeWidth={2}
					/>
				</AreaChart>
			</ResponsiveContainer>
		</div>
	);
}

import { useEffect, useMemo, useState } from "react";
import { ChartCard } from "./components/ChartCard";
import { ControlsPanel } from "./components/ControlsPanel";
import { ErrorBanner } from "./components/ErrorBanner";
import { RangeSelector } from "./components/RangeSelector";
import { StatTile } from "./components/StatTile";
import { StatusBadge } from "./components/StatusBadge";
import { TimeSeriesChart } from "./components/TimeSeriesChart";
import { useBattery } from "./hooks/useBattery";
import { derive, filterByRange } from "./lib/battery";
import { EM_DASH, fmt, fmtSigned, roundSmart } from "./lib/format";
import { requestEdgeToEdge, toast } from "./lib/ksu";
import type { Config, RangeHours } from "./lib/types";

export function App() {
	const battery = useBattery();
	const [range, setRange] = useState<RangeHours>(24);

	useEffect(requestEdgeToEdge, []);

	const stats = useMemo(
		() => derive(battery.rows, battery.live),
		[battery.rows, battery.live],
	);
	const windowed = useMemo(
		() => filterByRange(battery.rows, range),
		[battery.rows, range],
	);

	const handleApply = async (next: Config) => {
		await battery.setConfig(next);
		toast(next.enabled ? `Logging every ${next.interval}s` : "Logging paused");
	};

	const handleStart = async () => {
		await battery.start();
		toast("Logger started");
	};

	const handleExport = async () => {
		const msg = await battery.exportLog();
		toast(msg.split("\n").pop() || "Exported");
	};

	const handleClear = async () => {
		await battery.clear();
		toast("Log cleared");
	};

	// Chart headers print the current reading in text ink — it names the series
	// (so the charts need no legend) and keeps the value readable regardless of
	// how the line's color renders.
	const reading = (v: number | null, unit: string, digits = 0) =>
		v === null ? `${EM_DASH} now` : `${v.toFixed(digits)}${unit} now`;

	return (
		<div className="min-h-dvh bg-plane">
			<header
				className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-hairline bg-surface px-4 py-3"
				style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
			>
				<h1 className="text-lg font-semibold text-ink">Battery Info</h1>
				<StatusBadge status={stats.status} pct={stats.pct} />
			</header>

			<main
				className="@container mx-auto flex w-full max-w-3xl flex-col gap-4 p-4"
				style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
			>
				{battery.error && (
					<ErrorBanner message={battery.error} onDismiss={battery.dismissError} />
				)}

				{/* Container query, not a media query: the WebView viewport and the
				    dev preview frame differ, and only the main column's own width
				    says whether four tiles fit. */}
				<section className="grid grid-cols-2 gap-2.5 @min-[480px]:grid-cols-4">
					<StatTile
						label="Level"
						value={fmt(stats.pct, "%")}
						note={stats.eta ?? undefined}
						hero
						span={2}
					/>
					<StatTile
						label="Current"
						value={stats.mA === null ? EM_DASH : fmtSigned(Math.round(stats.mA), " mA")}
					/>
					<StatTile label="Temp" value={fmt(stats.tempC, " °C", 1)} />
					<StatTile label="Voltage" value={fmt(stats.voltageV, " V", 3)} />
					<StatTile
						label="Health"
						value={stats.healthPct === null ? (stats.health ?? EM_DASH) : fmt(stats.healthPct, "%")}
						hint={stats.healthPct !== null ? (stats.health ?? undefined) : undefined}
					/>
					<StatTile
						label="Cycles"
						value={stats.cycleCount === null ? EM_DASH : String(stats.cycleCount)}
					/>
					<StatTile
						label="Rate"
						value={stats.ratePerHour === null ? EM_DASH : fmtSigned(stats.ratePerHour, " %/h", 1)}
					/>
				</section>

				<ControlsPanel
					config={battery.config}
					daemonPid={battery.daemonPid}
					onApply={handleApply}
					onStart={handleStart}
					onExport={handleExport}
					onClear={handleClear}
				/>

				<RangeSelector value={range} onChange={setRange} sampleCount={windowed.length} />

				{battery.loading ? (
					<p className="py-10 text-center text-sm text-muted">Reading log…</p>
				) : (
					<div className="flex flex-col gap-4">
						<ChartCard title="Battery level" reading={reading(stats.pct, "%")}>
							<TimeSeriesChart
								rows={windowed}
								field="pct"
								colorVar="--color-series-level"
								unit="%"
								yDomain={[0, 100]}
								stale={battery.refreshing}
							/>
						</ChartCard>

						<ChartCard
							title="Current"
							reading={stats.mA === null ? `${EM_DASH} now` : `${fmtSigned(roundSmart(stats.mA), " mA", 0)} now`}
						>
							<TimeSeriesChart
								rows={windowed}
								field="mA"
								colorVar="--color-series-current"
								unit=" mA"
								diverging
								stale={battery.refreshing}
							/>
						</ChartCard>

						<ChartCard title="Temperature" reading={reading(stats.tempC, " °C", 1)}>
							<TimeSeriesChart
								rows={windowed}
								field="tempC"
								colorVar="--color-series-temp"
								unit=" °C"
								stale={battery.refreshing}
							/>
						</ChartCard>
					</div>
				)}
			</main>
		</div>
	);
}

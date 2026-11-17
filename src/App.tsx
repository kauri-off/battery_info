import { useEffect, useMemo, useState } from "react";
import { ChartCard } from "./components/ChartCard";
import { ControlsPanel } from "./components/ControlsPanel";
import { ErrorBanner } from "./components/ErrorBanner";
import { RangeSelector } from "./components/RangeSelector";
import { StatTile } from "./components/StatTile";
import { StatusBadge } from "./components/StatusBadge";
import { TimeSeriesChart } from "./components/TimeSeriesChart";
import { useBattery } from "./hooks/useBattery";
import { chartRows, DEFAULT_CONFIG, derive } from "./lib/battery";
import { EM_DASH, fmt, fmtBytes, fmtHours, fmtInterval, fmtSigned, roundSmart } from "./lib/format";
import { requestEdgeToEdge, toast } from "./lib/ksu";
import type { Config, RangeHours } from "./lib/types";

export function App() {
	const [range, setRange] = useState<RangeHours>(24);
	const battery = useBattery(range);
	const { state, log } = battery;
	const live = state?.live ?? null;

	useEffect(requestEdgeToEdge, []);

	const stats = useMemo(() => derive(log?.rows ?? [], live), [log, live]);

	const view = useMemo(() => {
		if (!log) return null;
		const to = Math.max(live?.t ?? 0, log.now);
		const from = log.hours ? to - log.hours * 3600 : log.from;
		return { domain: [from, to] as [number, number], rows: chartRows(log.rows, live, from) };
	}, [log, live]);

	const lastLogged = state?.lastLogged ?? null;
	const lastSampleAge = lastLogged && live ? Math.max(0, live.t - lastLogged.t) : null;
	const stale = log !== null && log.hours !== range;

	const handleConfig = async (next: Config) => {
		await battery.setConfig(next);
		toast(next.enabled ? `Logging every ${fmtInterval(next.interval)}` : "Logging paused");
	};
	const handleStart = async () => {
		await battery.start();
		toast("Logger started");
	};
	const handleRestart = async () => {
		await battery.restart();
		toast("Logger restarted");
	};
	const handleExport = async () => {
		toast(`Exported to ${await battery.exportLog()}`);
	};
	const handleClear = async () => {
		await battery.clear();
		toast("Log cleared");
	};

	const now = (text: string) => `${text} now`;

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

				{/* A container query: the dev frame is narrower than its viewport. */}
				<section className="grid grid-cols-2 gap-2.5 @min-[480px]:grid-cols-4">
					<StatTile
						label="Level"
						value={fmt(stats.pct, "%")}
						note={stats.eta ? `${fmtHours(stats.eta.hours)} to ${stats.eta.to}` : undefined}
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
						hint={stats.healthPct === null ? undefined : (stats.health ?? undefined)}
					/>
					<StatTile label="Cycles" value={fmt(stats.cycles)} />
					<StatTile label="Rate" value={fmtSigned(stats.ratePerHour, " %/h", 1)} />
				</section>

				<ControlsPanel
					config={state?.config ?? DEFAULT_CONFIG}
					daemonPids={state?.daemonPids ?? []}
					ready={state !== null}
					lastSampleAge={lastSampleAge}
					logSummary={log && `${log.fileRows.toLocaleString()} samples · ${fmtBytes(log.fileBytes)}`}
					onConfig={handleConfig}
					onStart={handleStart}
					onRestart={handleRestart}
					onExport={handleExport}
					onClear={handleClear}
				/>

				<RangeSelector value={range} onChange={setRange} sampleCount={stale ? null : (log?.total ?? null)} />

				{view === null ? (
					<p className="py-10 text-center text-sm text-muted">Reading log…</p>
				) : (
					<div className="flex flex-col gap-4">
						<ChartCard title="Battery level" reading={now(fmt(stats.pct, "%"))}>
							<TimeSeriesChart
								rows={view.rows}
								domain={view.domain}
								field="pct"
								colorVar="--color-series-level"
								unit="%"
								yDomain={[0, 100]}
								stale={stale}
							/>
						</ChartCard>

						<ChartCard
							title="Current"
							reading={now(stats.mA === null ? EM_DASH : fmtSigned(roundSmart(stats.mA), " mA"))}
						>
							<TimeSeriesChart
								rows={view.rows}
								domain={view.domain}
								field="mA"
								colorVar="--color-series-current"
								unit=" mA"
								diverging
								stale={stale}
							/>
						</ChartCard>

						<ChartCard title="Temperature" reading={now(fmt(stats.tempC, " °C", 1))}>
							<TimeSeriesChart
								rows={view.rows}
								domain={view.domain}
								field="tempC"
								colorVar="--color-series-temp"
								unit=" °C"
								stale={stale}
							/>
						</ChartCard>
					</div>
				)}
			</main>
		</div>
	);
}

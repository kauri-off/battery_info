import { useState } from "react";
import { MIN_INTERVAL } from "../lib/battery";
import { fmtAge, fmtInterval } from "../lib/format";
import type { Config } from "../lib/types";

const PRESETS = [15, 30, 60, 120, 300, 600];

const BTN = "rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50";
const BTN_SM = "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50";

type Action = "config" | "start" | "restart" | "export" | "clear";

type Props = {
	config: Config;
	daemonPids: number[];
	/** False until the device has been read once. */
	ready: boolean;
	/** Seconds since the newest logged sample; null when the log is empty. */
	lastSampleAge: number | null;
	/** Size of the whole log, e.g. "50,590 samples · 5.2 MB". */
	logSummary: string | null;
	onConfig: (next: Config) => Promise<void>;
	onStart: () => Promise<void>;
	onRestart: () => Promise<void>;
	onExport: () => Promise<void>;
	onClear: () => Promise<void>;
};

type Status = {
	dot: string;
	title: string;
	detail: string;
	fix?: { action: "start" | "restart"; label: string; busyLabel: string };
};

// One line that says whether samples are landing; the switch alone cannot,
// because config only speaks to a daemon that is alive.
function describe(
	ready: boolean, config: Config, daemonPids: number[], lastSampleAge: number | null,
): Status {
	if (!ready) {
		return { dot: "bg-muted", title: "Connecting…", detail: "Reading the device." };
	}
	if (!config.enabled) {
		return { dot: "bg-muted", title: "Paused", detail: "Nothing is being recorded." };
	}
	if (daemonPids.length === 0) {
		return {
			dot: "bg-critical",
			title: "Not running",
			detail: "The logger daemon has stopped.",
			fix: { action: "start", label: "Start", busyLabel: "Starting…" },
		};
	}
	if (daemonPids.length > 1) {
		return {
			dot: "bg-warning",
			title: "Recording twice",
			detail: `${daemonPids.length} loggers are running at once.`,
			fix: { action: "restart", label: "Restart", busyLabel: "Restarting…" },
		};
	}
	const every = `Every ${fmtInterval(config.interval)}`;
	return {
		dot: "bg-good",
		title: "Recording",
		detail: lastSampleAge === null ? `${every} · no samples yet` : `${every} · last sample ${fmtAge(lastSampleAge)}`,
	};
}

export function ControlsPanel({
	config, daemonPids, ready, lastSampleAge, logSummary,
	onConfig, onStart, onRestart, onExport, onClear,
}: Props) {
	const [busy, setBusy] = useState<Action | null>(null);
	const [confirmClear, setConfirmClear] = useState(false);
	const status = describe(ready, config, daemonPids, lastSampleAge);
	const locked = !ready || busy !== null;

	// A hand-edited config may hold an interval that is not a preset.
	const options = PRESETS.includes(config.interval)
		? PRESETS
		: [...PRESETS, config.interval].sort((a, b) => a - b);

	const run = async (action: Action, fn: () => Promise<void>) => {
		setBusy(action);
		try {
			await fn();
		} catch {
			/* the hook has put it in the error banner */
		} finally {
			setBusy(null);
		}
	};

	return (
		<section className="rounded-xl border border-hairline bg-surface">
			<div className="flex items-center gap-3 p-4">
				<span className={`h-2.5 w-2.5 shrink-0 rounded-full ${status.dot}`} aria-hidden />
				<div className="min-w-0 flex-1">
					<div className="text-sm font-medium text-ink">{status.title}</div>
					<div className="text-xs text-ink-2">{status.detail}</div>
				</div>
				{status.fix && (
					<button
						type="button"
						disabled={locked}
						onClick={() => run(status.fix!.action, status.fix!.action === "start" ? onStart : onRestart)}
						className={`${BTN_SM} border-hairline bg-raised text-ink`}
					>
						{busy === status.fix.action ? status.fix.busyLabel : status.fix.label}
					</button>
				)}
				<button
					type="button"
					role="switch"
					aria-checked={config.enabled}
					aria-label="Logging"
					disabled={locked}
					onClick={() => run("config", () => onConfig({ ...config, enabled: !config.enabled }))}
					className={[
						"relative h-7 w-12 shrink-0 rounded-full border transition-colors disabled:opacity-60",
						config.enabled ? "border-good bg-good" : "border-hairline bg-raised",
					].join(" ")}
				>
					<span
						className={[
							"absolute top-0.5 left-0 h-5 w-5 rounded-full transition-transform",
							config.enabled ? "translate-x-6 bg-white" : "translate-x-0.5 bg-muted",
						].join(" ")}
					/>
				</button>
			</div>

			<div className="flex items-center justify-between gap-4 border-t border-hairline px-4 py-3">
				<label htmlFor="interval" className="text-sm text-ink">Interval</label>
				<select
					id="interval"
					value={config.interval}
					disabled={locked}
					onChange={(e) => {
						const interval = Math.max(MIN_INTERVAL, Number(e.target.value));
						void run("config", () => onConfig({ ...config, interval }));
					}}
					className="rounded-lg border border-hairline bg-raised px-3 py-2 text-sm text-ink disabled:opacity-60"
				>
					{options.map((s) => (
						<option key={s} value={s}>{fmtInterval(s)}</option>
					))}
				</select>
			</div>

			<div className="flex flex-col gap-3 border-t border-hairline p-4">
				<div className="flex flex-wrap gap-2">
					<button
						type="button"
						disabled={locked}
						onClick={() => run("export", onExport)}
						className={`${BTN} border-hairline bg-raised text-ink`}
					>
						{busy === "export" ? "Exporting…" : "Export CSV"}
					</button>
					{/* Two steps instead of confirm(): some managers suppress native dialogs. */}
					{confirmClear ? (
						<>
							<button
								type="button"
								disabled={locked}
								onClick={() => {
									setConfirmClear(false);
									void run("clear", onClear);
								}}
								className={`${BTN} border-critical bg-critical text-white`}
							>
								Erase all history
							</button>
							<button
								type="button"
								onClick={() => setConfirmClear(false)}
								className={`${BTN} border-hairline bg-raised text-ink`}
							>
								Cancel
							</button>
						</>
					) : (
						<button
							type="button"
							disabled={locked}
							onClick={() => setConfirmClear(true)}
							className={`${BTN} border-critical/50 bg-surface text-critical`}
						>
							{busy === "clear" ? "Clearing…" : "Clear log"}
						</button>
					)}
				</div>
				{logSummary && <p className="text-xs text-muted tabular-nums">{logSummary}</p>}
			</div>
		</section>
	);
}

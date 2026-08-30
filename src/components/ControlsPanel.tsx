// ControlsPanel.tsx — daemon controls. Edits are staged locally and only hit
// the device on Apply, so a mistyped interval never reaches config.sh.

import { useEffect, useState } from "react";
import type { Config } from "../lib/types";

const PRESETS = [15, 30, 60, 120, 300, 600];

function intervalLabel(seconds: number): string {
	if (seconds < 60) return `${seconds}s`;
	const m = seconds / 60;
	return Number.isInteger(m) ? `${m}m` : `${seconds}s`;
}

type Props = {
	config: Config;
	/** Pid of the running daemon, or null when nothing is sampling. */
	daemonPid: number | null;
	onApply: (next: Config) => Promise<void>;
	onStart: () => Promise<void>;
	onExport: () => Promise<void>;
	onClear: () => Promise<void>;
};

const BTN = "rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50";
// Its own string rather than BTN plus overrides: conflicting Tailwind
// utilities resolve by stylesheet order, not by order in the class list.
const BTN_SM = "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50";

export function ControlsPanel({
	config, daemonPid, onApply, onStart, onExport, onClear,
}: Props) {
	const [draft, setDraft] = useState<Config>(config);
	const [busy, setBusy] = useState<null | "apply" | "start" | "export" | "clear">(null);
	const [confirmClear, setConfirmClear] = useState(false);
	const running = daemonPid !== null;

	// Adopt values read back from the device, but never stomp a pending edit.
	useEffect(() => setDraft(config), [config]);

	// A device may hold an interval that isn't one of ours (hand-edited
	// config.sh); keep it selectable instead of silently rewriting it.
	const options = PRESETS.includes(draft.interval)
		? PRESETS
		: [...PRESETS, draft.interval].sort((a, b) => a - b);

	const dirty = draft.enabled !== config.enabled || draft.interval !== config.interval;

	const run = async (key: "apply" | "start" | "export" | "clear", fn: () => Promise<void>) => {
		setBusy(key);
		try {
			await fn();
		} catch {
			/* the hook has already surfaced it in the error banner */
		} finally {
			setBusy(null);
		}
	};

	return (
		<section className="flex flex-col gap-4 rounded-xl border border-hairline bg-surface p-4">
			{/* The daemon is what actually samples; the toggle below only tells a
			    running one whether to record. Showing them as one control would
			    let a dead daemon read as "logging on". */}
			<div className="flex items-center justify-between gap-3">
				<span className="text-sm text-ink">Daemon</span>
				<span className="flex items-center gap-2">
					<span
						className={`h-2 w-2 shrink-0 rounded-full ${running ? "bg-good" : "bg-critical"}`}
						aria-hidden
					/>
					<span className="text-xs text-ink-2">
						{running ? `running · pid ${daemonPid}` : "stopped"}
					</span>
					{!running && (
						<button
							type="button"
							disabled={busy !== null}
							onClick={() => run("start", onStart)}
							className={`${BTN_SM} border-good bg-good text-white`}
						>
							{busy === "start" ? "Starting…" : "Start"}
						</button>
					)}
				</span>
			</div>

			{!running && (
				<p className="-mt-2 text-xs text-muted">
					Nothing is being sampled. The daemon normally starts itself at boot
					and runs until the next one; start it here if it was killed.
				</p>
			)}

			<div className="flex items-center justify-between gap-4">
				<label htmlFor="logging" className="text-sm text-ink">Logging</label>
				<button
					id="logging"
					type="button"
					role="switch"
					aria-checked={draft.enabled}
					onClick={() => setDraft((d) => ({ ...d, enabled: !d.enabled }))}
					className={[
						"relative h-7 w-12 shrink-0 rounded-full border transition-colors",
						draft.enabled ? "border-good bg-good" : "border-hairline bg-raised",
					].join(" ")}
				>
					<span
						className={[
							"absolute top-0.5 left-0 h-5 w-5 rounded-full transition-transform",
							draft.enabled ? "translate-x-6 bg-white" : "translate-x-0.5 bg-muted",
						].join(" ")}
					/>
				</button>
			</div>

			<div className="flex items-center justify-between gap-4">
				<label htmlFor="interval" className="text-sm text-ink">Interval</label>
				<select
					id="interval"
					value={draft.interval}
					onChange={(e) => setDraft((d) => ({ ...d, interval: Number(e.target.value) }))}
					className="rounded-lg border border-hairline bg-raised px-3 py-2 text-sm text-ink"
				>
					{options.map((s) => (
						<option key={s} value={s}>{intervalLabel(s)}</option>
					))}
				</select>
			</div>

			<div className="flex flex-wrap gap-2">
				<button
					type="button"
					disabled={!dirty || busy !== null}
					onClick={() => run("apply", () => onApply(draft))}
					className={`${BTN} border-series-level bg-series-level text-white`}
				>
					{busy === "apply" ? "Applying…" : "Apply"}
				</button>
				<button
					type="button"
					disabled={busy !== null}
					onClick={() => run("export", onExport)}
					className={`${BTN} border-hairline bg-raised text-ink`}
				>
					{busy === "export" ? "Exporting…" : "Export CSV"}
				</button>
				{/* Two-step instead of confirm(): WebViews render native dialogs
				    inconsistently, and some managers suppress them outright. */}
				{confirmClear ? (
					<span className="flex gap-2">
						<button
							type="button"
							disabled={busy !== null}
							onClick={() => {
								setConfirmClear(false);
								void run("clear", onClear);
							}}
							className={`${BTN} border-critical bg-critical text-white`}
						>
							{busy === "clear" ? "Clearing…" : "Erase all history"}
						</button>
						<button
							type="button"
							onClick={() => setConfirmClear(false)}
							className={`${BTN} border-hairline bg-raised text-ink`}
						>
							Cancel
						</button>
					</span>
				) : (
					<button
						type="button"
						disabled={busy !== null}
						onClick={() => setConfirmClear(true)}
						className={`${BTN} border-critical/50 bg-surface text-critical`}
					>
						Clear log
					</button>
				)}
			</div>
		</section>
	);
}

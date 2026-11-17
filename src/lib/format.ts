export const EM_DASH = "—";

export function fmt(v: number | null, unit = "", digits = 0): string {
	return v === null || Number.isNaN(v) ? EM_DASH : `${v.toFixed(digits)}${unit}`;
}

export function fmtSigned(v: number | null, unit = "", digits = 0): string {
	if (v === null || Number.isNaN(v)) return EM_DASH;
	const text = v.toFixed(digits);
	return `${v > 0 && Number(text) !== 0 ? "+" : ""}${text}${unit}`;
}

/** Hours as "3h 12m" / "45m". */
export function fmtHours(h: number): string {
	if (!Number.isFinite(h)) return EM_DASH;
	const total = Math.round(h * 60);
	const hh = Math.floor(total / 60);
	const mm = total % 60;
	return hh > 0 ? `${hh}h ${mm}m` : `${mm}m`;
}

/** Seconds as the coarsest unit that divides them: "15s", "2m", "1h". */
export function fmtInterval(seconds: number): string {
	if (seconds >= 3600 && seconds % 3600 === 0) return `${seconds / 3600}h`;
	if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60}m`;
	return `${seconds}s`;
}

/** Elapsed seconds as "just now", "42s ago", "5m ago", "3h ago", "2d ago". */
export function fmtAge(seconds: number): string {
	if (seconds < 5) return "just now";
	if (seconds < 60) return `${Math.floor(seconds)}s ago`;
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
	if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
	return `${Math.floor(seconds / 86400)}d ago`;
}

export function fmtBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function fmtClock(epochSeconds: number): string {
	const d = new Date(epochSeconds * 1000);
	return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function fmtDay(epochSeconds: number): string {
	return new Date(epochSeconds * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function fmtStamp(epochSeconds: number): string {
	return `${fmtDay(epochSeconds)} · ${fmtClock(epochSeconds)}`;
}

/** Keeps small readings precise and large ones uncluttered. */
export function roundSmart(v: number): number {
	return Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
}

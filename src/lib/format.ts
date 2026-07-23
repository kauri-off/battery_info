// format.ts — display formatting helpers. Pure; no device access.

const EM_DASH = "—";

// Format a number with a unit, or an em dash when there is nothing to show.
export function fmt(v: number | null | undefined, unit = "", digits = 0): string {
	if (v === null || v === undefined || Number.isNaN(v)) return EM_DASH;
	return `${v.toFixed(digits)}${unit}`;
}

// Same, but always carries an explicit sign (for current and drain rate).
export function fmtSigned(v: number | null | undefined, unit = "", digits = 0): string {
	if (v === null || v === undefined || Number.isNaN(v)) return EM_DASH;
	return `${v > 0 ? "+" : ""}${v.toFixed(digits)}${unit}`;
}

// Hours as "3h 12m" / "45m".
export function fmtHours(h: number): string {
	if (!Number.isFinite(h)) return EM_DASH;
	const total = Math.round(h * 60);
	const hh = Math.floor(total / 60);
	const mm = total % 60;
	return hh > 0 ? `${hh}h ${mm}m` : `${mm}m`;
}

// Wall-clock HH:MM for a chart tick / tooltip.
export function fmtClock(epochSeconds: number): string {
	const d = new Date(epochSeconds * 1000);
	return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Date + time, for the tooltip header where the day matters.
export function fmtStamp(epochSeconds: number): string {
	const d = new Date(epochSeconds * 1000);
	const day = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
	return `${day} · ${fmtClock(epochSeconds)}`;
}

// Keep small readings precise and large ones uncluttered.
export function roundSmart(v: number): number {
	return Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
}

export { EM_DASH };

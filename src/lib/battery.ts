// battery.ts — data layer for the Battery Info Logger WebUI. Reads/writes the
// module's config, log CSV and live battery state over the root shell, and
// derives the summary stats the dashboard shows.

import { sh, q, MODULE_ID } from "./ksu";
import { fmtHours } from "./format";
import { COLUMNS, CSV_HEADER, type BatteryRow, type Config, type Derived } from "./types";

export const MODDIR = `/data/adb/modules/${MODULE_ID}`;
export const DATA_DIR = `/data/adb/${MODULE_ID}`;
export const CONFIG = `${DATA_DIR}/config.sh`;
export const CSV = `${DATA_DIR}/battery.csv`;
export const COMMON = `${MODDIR}/scripts/battery_common.sh`;

export const DEFAULT_CONFIG: Config = { enabled: true, interval: 60 };
export const MIN_INTERVAL = 5;

function toNum(v: string | undefined): number | null {
	if (v === undefined || v === "") return null;
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
}

// current_now's sign convention varies across devices. Normalize to mA where
// charging is positive and discharging is negative, using status as truth.
export function normCurrent(ua: number | null, status: string): number | null {
	if (ua === null) return null;
	const mA = ua / 1000;
	const mag = Math.abs(mA);
	if (status === "Charging" || status === "Full") return mag;
	if (status === "Discharging") return -mag;
	return mA; // Not charging / Unknown: keep the raw sign.
}

// Parse one CSV data line into a row. Missing trailing fields become "".
export function parseRow(line: string): BatteryRow | null {
	const parts = line.split(",");
	const raw = {} as Record<(typeof COLUMNS)[number], string>;
	COLUMNS.forEach((c, i) => (raw[c] = parts[i] ?? ""));

	const t = toNum(raw.epoch);
	if (t === null) return null;

	const uv = toNum(raw.voltage_uv);
	const temp = toNum(raw.temp_dc);
	return {
		...raw,
		t,
		pct: toNum(raw.capacity),
		tempC: temp === null ? null : temp / 10,
		voltageV: uv === null ? null : uv / 1e6,
		mA: normCurrent(toNum(raw.current_ua), raw.status),
	};
}

// Parse the whole CSV: drop the header, skip unparseable lines, sort by time.
export function parseLog(text: string): BatteryRow[] {
	const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
	if (lines[0]?.startsWith("epoch")) lines.shift();
	const rows = lines
		.map(parseRow)
		.filter((r): r is BatteryRow => r !== null);
	rows.sort((a, b) => a.t - b.t);
	return rows;
}

// Parse config.sh. Unset or nonsensical values fall back to the defaults.
export function parseConfig(text: string): Config {
	const cfg: Config = { ...DEFAULT_CONFIG };
	for (const line of text.split("\n")) {
		const m = line.match(/^\s*(LOG_ENABLED|LOG_INTERVAL)\s*=\s*(\d+)/);
		if (!m) continue;
		if (m[1] === "LOG_ENABLED") cfg.enabled = m[2] === "1";
		else cfg.interval = Number(m[2]);
	}
	if (!Number.isFinite(cfg.interval) || cfg.interval < MIN_INTERVAL) {
		cfg.interval = DEFAULT_CONFIG.interval;
	}
	return cfg;
}

// ---- Device I/O ---------------------------------------------------------

export async function readLog(): Promise<BatteryRow[]> {
	try {
		return parseLog(await sh(`cat ${CSV} 2>/dev/null || true`));
	} catch {
		return [];
	}
}

// Read a live sample by sourcing the module's shared shell helper.
export async function readLive(): Promise<BatteryRow | null> {
	const out = await sh(`. ${COMMON}; read_row`);
	const line = out.split("\n").map((l) => l.trim()).find(Boolean);
	return line ? parseRow(line) : null;
}

export async function readConfig(): Promise<Config> {
	try {
		return parseConfig(await sh(`cat ${CONFIG} 2>/dev/null || true`));
	} catch {
		return { ...DEFAULT_CONFIG };
	}
}

// Write config.sh atomically so the daemon never sources a half-written file.
export async function writeConfig({ enabled, interval }: Config): Promise<void> {
	const en = enabled ? 1 : 0;
	const iv = Math.max(MIN_INTERVAL, Math.round(interval) || DEFAULT_CONFIG.interval);
	const tmp = `${CONFIG}.tmp`;
	await sh(
		`printf 'LOG_ENABLED=%s\\nLOG_INTERVAL=%s\\n' ${en} ${iv} > ${tmp} && mv ${tmp} ${CONFIG}`,
	);
}

// Truncate the log, keeping only the header.
export async function clearLog(): Promise<void> {
	await sh(`printf '%s\\n' ${q(CSV_HEADER)} > ${CSV}`);
}

// Trigger the module's Action export script. Returns its stdout message.
export async function exportCsv(): Promise<string> {
	return (await sh(`sh ${MODDIR}/action.sh`)).trim();
}

// ---- Derived stats ------------------------------------------------------

/** Window used to estimate the drain/charge rate. */
const RATE_WINDOW_S = 30 * 60;
/** Below this |%/h| the trend is noise, not a usable estimate. */
const RATE_DEADBAND = 0.1;

/**
 * Which way the charge is moving: +1 charging, -1 discharging, 0 unknown.
 * Status is the truth (it is what normCurrent signs the current from); the
 * current's own sign only speaks when status carries no direction.
 */
export function direction(status: string, mA: number | null): -1 | 0 | 1 {
	if (status === "Charging" || status === "Full") return 1;
	if (status === "Discharging") return -1;
	if (mA !== null && mA !== 0) return mA > 0 ? 1 : -1;
	return 0;
}

// Trailing samples that belong to the session running now, i.e. back to the
// last change of direction. Without this, a charge that ended a few minutes
// ago still sits inside the rate window and reports a rising level — and a
// "to full" ETA — for a phone that is currently draining.
function currentSession(rows: BatteryRow[], dir: -1 | 0 | 1): BatteryRow[] {
	let i = rows.length - 1;
	while (i > 0) {
		const prev = rows[i - 1]!;
		const d = direction(prev.status, prev.mA);
		if (d !== 0 && d !== dir) break;
		i--;
	}
	return rows.slice(i);
}

export function derive(rows: BatteryRow[], live: BatteryRow | null): Derived {
	const last = live ?? rows[rows.length - 1] ?? null;
	const out: Derived = {
		pct: last?.pct ?? null,
		status: last?.status || "Unknown",
		mA: last?.mA ?? null,
		tempC: last?.tempC ?? null,
		voltageV: last?.voltageV ?? null,
		cycleCount: last ? toNum(last.cycle_count) : null,
		health: last?.health || null,
		healthPct: null,
		ratePerHour: null,
		eta: null,
	};

	// Battery health % from charge_full / charge_full_design.
	const cf = last ? toNum(last.charge_full) : null;
	const cfd = last ? toNum(last.charge_full_design) : null;
	if (cf !== null && cfd !== null && cfd > 0) out.healthPct = (cf / cfd) * 100;

	// Drain/charge rate across the recent window. The live sample is newer than
	// anything logged, so it joins the series when it is.
	const series = rows.filter((r) => r.pct !== null);
	if (live?.pct != null && live.t > (series[series.length - 1]?.t ?? -Infinity)) {
		series.push(live);
	}

	const dir = direction(out.status, out.mA);
	const session = currentSession(series, dir);
	const end = session[session.length - 1];
	let start = session[0];
	if (session.length >= 2 && end && start) {
		const cutoff = end.t - RATE_WINDOW_S;
		for (const r of session) {
			if (r.t >= cutoff) { start = r; break; }
		}
		const dh = (end.t - start.t) / 3600;
		if (dh > 0 && end.pct !== null && start.pct !== null) {
			const rate = (end.pct - start.pct) / dh;
			// A trend that contradicts the direction the device reports — a 1%
			// gauge tick the wrong way, a level that hasn't caught up with the
			// cable being pulled — is not a measurement worth showing.
			const agrees = dir === 0 || Math.abs(rate) <= RATE_DEADBAND || Math.sign(rate) === dir;
			if (agrees) {
				out.ratePerHour = rate;
				if (rate < -RATE_DEADBAND && out.pct !== null) {
					out.eta = `${fmtHours(out.pct / -rate)} to empty`;
				} else if (rate > RATE_DEADBAND && out.pct !== null) {
					out.eta = `${fmtHours((100 - out.pct) / rate)} to full`;
				}
			}
		}
	}

	return out;
}

// Rows inside the selected chart window, measured back from the newest sample.
export function filterByRange(rows: BatteryRow[], hours: number): BatteryRow[] {
	if (!hours || !rows.length) return rows;
	const end = rows[rows.length - 1]!.t;
	const cutoff = end - hours * 3600;
	return rows.filter((r) => r.t >= cutoff);
}

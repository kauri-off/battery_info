import {
	COLUMNS, type Config, type DeviceState, type Eta, type LogWindow, type Sample, type Stats,
} from "./types";

export const DEFAULT_CONFIG: Config = { enabled: true, interval: 60 };
export const MIN_INTERVAL = 5;
/** The device never thins rows newer than this; the rate is measured on them. */
export const DENSE_S = 30 * 60;

const RATE_WINDOW_S = DENSE_S;
const RATE_MIN_SPAN_S = 5 * 60;
/** Below this |%/h| the trend is noise, not a forecast. */
const RATE_DEADBAND = 0.1;
/** Faster than any real charger: a charge counter saying so is broken. */
const RATE_MAX = 600;

function toNum(v: string | undefined): number | null {
	if (v === undefined || v === "") return null;
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
}

// current_now's sign convention varies by device, so status decides the sign.
export function normCurrent(ua: number | null, status: string): number | null {
	if (ua === null) return null;
	const mA = ua / 1000;
	if (status === "Charging" || status === "Full") return Math.abs(mA);
	if (status === "Discharging") return -Math.abs(mA);
	return mA;
}

export function parseRow(line: string): Sample | null {
	const parts = line.trim().split(",");
	const f = {} as Record<(typeof COLUMNS)[number], string>;
	COLUMNS.forEach((c, i) => (f[c] = parts[i] ?? ""));

	if (!/^\d+$/.test(f.epoch)) return null;
	const temp = toNum(f.temp_dc);
	const uv = toNum(f.voltage_uv);
	return {
		t: Number(f.epoch),
		pct: toNum(f.capacity),
		status: f.status,
		mA: normCurrent(toNum(f.current_ua), f.status),
		tempC: temp === null ? null : temp / 10,
		voltageV: uv === null ? null : uv / 1e6,
		chargeUah: toNum(f.charge_counter_uah),
		cycles: toNum(f.cycle_count),
		health: f.health,
		fullUah: toNum(f.charge_full),
		designUah: toNum(f.charge_full_design),
	};
}

export function parseRows(lines: string[]): Sample[] {
	const rows = lines.map(parseRow).filter((r): r is Sample => r !== null);
	return rows.sort((a, b) => a.t - b.t);
}

// One row per bucket, every row from denseFrom on, and always the newest one.
export function thin(rows: Sample[], bucket: number, denseFrom: number): Sample[] {
	if (bucket <= 1) return rows;
	let prev = NaN;
	return rows.filter((r, i) => {
		const k = Math.floor(r.t / bucket);
		const keep = r.t >= denseFrom || k !== prev || i === rows.length - 1;
		if (keep) prev = k;
		return keep;
	});
}

function splitMeta(text: string): { meta: Map<string, string>; lines: string[] } {
	const meta = new Map<string, string>();
	const lines: string[] = [];
	for (const line of text.split("\n")) {
		const m = line.match(/^#(\w+)=(.*)$/);
		if (m) meta.set(m[1]!, m[2]!.trim());
		else if (line.trim()) lines.push(line);
	}
	return { meta, lines };
}

// Output of `webui.sh log`: CSV rows plus #key=value metadata lines.
export function parseLog(text: string): LogWindow {
	const { meta, lines } = splitMeta(text);
	const num = (key: string) => toNum(meta.get(key));
	let rows = parseRows(lines);
	const now = num("now") ?? rows.at(-1)?.t ?? Math.floor(Date.now() / 1000);
	const from = num("from") ?? rows[0]?.t ?? now;
	let total = num("total") ?? rows.length;
	let fileRows = num("rows") ?? rows.length;

	// The device had no awk and sent the whole file: do its job here.
	if (meta.get("raw") === "1") {
		fileRows = rows.length;
		rows = rows.filter((r) => r.t >= from);
		total = rows.length;
		rows = thin(rows, num("bucket") ?? 1, now - DENSE_S);
	}
	return { rows, now, from, total, fileRows, fileBytes: num("bytes") ?? 0 };
}

// Output of `webui.sh state`: key=value lines.
export function parseState(text: string): DeviceState {
	const state: DeviceState = {
		config: { ...DEFAULT_CONFIG },
		daemonPids: [],
		live: null,
		lastLogged: null,
	};
	for (const line of text.split("\n")) {
		const i = line.indexOf("=");
		if (i < 0) continue;
		const value = line.slice(i + 1).trim();
		switch (line.slice(0, i)) {
			case "config": {
				const [enabled, interval] = value.split(",");
				const seconds = toNum(interval);
				state.config = {
					enabled: enabled !== "0",
					interval: seconds !== null && seconds >= MIN_INTERVAL ? seconds : DEFAULT_CONFIG.interval,
				};
				break;
			}
			case "daemon":
				state.daemonPids = value.split(/\s+/).filter((p) => /^[1-9]\d*$/.test(p)).map(Number);
				break;
			case "row":
				state.live = parseRow(value);
				break;
			case "last":
				state.lastLogged = parseRow(value);
				break;
		}
	}
	return state;
}

/** Which way the charge is moving: +1 charging, -1 discharging, 0 unknown. */
export function direction(status: string, mA: number | null): -1 | 0 | 1 {
	if (status === "Charging" || status === "Full") return 1;
	if (status === "Discharging") return -1;
	if (mA !== null && mA !== 0) return mA > 0 ? 1 : -1;
	return 0;
}

// Trailing samples since the last change of direction, so a charge that just
// ended cannot report a rising level for a phone that is now draining.
function currentSession(rows: Sample[], dir: -1 | 0 | 1): Sample[] {
	let i = rows.length - 1;
	while (i > 0) {
		const prev = rows[i - 1]!;
		const d = direction(prev.status, prev.mA);
		if (d !== 0 && d !== dir) break;
		i--;
	}
	return rows.slice(i);
}

// %/h from the charge counter: far finer than the 1% steps of the level.
function counterRate(start: Sample, end: Sample, hours: number): number | null {
	const full = end.fullUah ?? end.designUah;
	if (start.chargeUah === null || end.chargeUah === null || !full || full <= 0) return null;
	if (start.chargeUah === end.chargeUah) return null;
	const rate = ((end.chargeUah - start.chargeUah) / full) * 100 / hours;
	return Math.abs(rate) <= RATE_MAX ? rate : null;
}

function measureRate(rows: Sample[], live: Sample | null, dir: -1 | 0 | 1): number | null {
	const series = rows.filter((r) => r.pct !== null);
	if (live && live.pct !== null && live.t > (series.at(-1)?.t ?? -Infinity)) series.push(live);

	const session = currentSession(series, dir);
	const end = session.at(-1);
	const start = end && session.find((r) => r.t >= end.t - RATE_WINDOW_S);
	if (!end || !start || end.t - start.t < RATE_MIN_SPAN_S) return null;

	const hours = (end.t - start.t) / 3600;
	const candidates = [counterRate(start, end, hours), (end.pct! - start.pct!) / hours];
	// A trend against the direction the device reports is not a measurement.
	const agrees = (r: number) => dir === 0 || Math.abs(r) <= RATE_DEADBAND || Math.sign(r) === dir;
	return candidates.find((r): r is number => r !== null && agrees(r)) ?? null;
}

function estimate(pct: number | null, rate: number | null, status: string): Eta | null {
	if (pct === null || rate === null || status === "Full") return null;
	if (rate < -RATE_DEADBAND) return { hours: pct / -rate, to: "empty" };
	if (rate > RATE_DEADBAND && pct < 100) return { hours: (100 - pct) / rate, to: "full" };
	return null;
}

export function derive(rows: Sample[], live: Sample | null): Stats {
	const last = live ?? rows.at(-1) ?? null;
	const status = last?.status || "Unknown";
	const pct = last?.pct ?? null;
	const mA = last?.mA ?? null;
	const ratePerHour = measureRate(rows, live, direction(status, mA));

	const full = last?.fullUah ?? null;
	const design = last?.designUah ?? null;
	return {
		pct,
		status,
		mA,
		tempC: last?.tempC ?? null,
		voltageV: last?.voltageV ?? null,
		cycles: last?.cycles ?? null,
		health: last?.health || null,
		healthPct: full !== null && design !== null && design > 0 ? (full / design) * 100 : null,
		ratePerHour,
		eta: estimate(pct, ratePerHour, status),
	};
}

// The window's rows with the live sample as the newest point, clipped to `from`.
export function chartRows(rows: Sample[], live: Sample | null, from: number): Sample[] {
	const out = rows.filter((r) => r.t >= from);
	if (live && live.t >= from && live.t > (out.at(-1)?.t ?? -Infinity)) out.push(live);
	return out;
}

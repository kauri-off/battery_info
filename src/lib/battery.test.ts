import { describe, expect, it } from "vitest";
import {
	derive, filterByRange, normCurrent, parseConfig, parseDaemonPid, parseLog, parseRow,
} from "./battery";
import { CSV_HEADER } from "./types";
import type { BatteryRow } from "./types";

// Build a CSV line from partial fields, defaulting to a plausible sample.
function line(over: Partial<Record<string, string | number>> = {}): string {
	const f = {
		epoch: 1_700_000_000, iso: "2023-11-14T22:13:20+0100", capacity: 63,
		status: "Discharging", voltage_uv: 3_980_000, current_ua: -920_000,
		temp_dc: 312, charge_counter_uah: 2_646_000, cycle_count: 137,
		health: "Good", charge_full: 4_210_000, charge_full_design: 4_500_000,
		...over,
	};
	return [
		f.epoch, f.iso, f.capacity, f.status, f.voltage_uv, f.current_ua, f.temp_dc,
		f.charge_counter_uah, f.cycle_count, f.health, f.charge_full, f.charge_full_design,
	].join(",");
}

// A minimal row for derive(): only the fields it reads. Discharging, as the
// default sample is; charging() is the same row plugged in.
function row(t: number, pct: number, over: Partial<BatteryRow> = {}): BatteryRow {
	return { ...parseRow(line({ epoch: t, capacity: pct }))!, ...over };
}

function charging(t: number, pct: number): BatteryRow {
	return parseRow(line({ epoch: t, capacity: pct, status: "Charging", current_ua: 1_200_000 }))!;
}

describe("normCurrent", () => {
	it("forces the sign from status, whatever the device reports", () => {
		// Same magnitude, opposite raw signs -> status decides.
		expect(normCurrent(900_000, "Charging")).toBe(900);
		expect(normCurrent(-900_000, "Charging")).toBe(900);
		expect(normCurrent(900_000, "Discharging")).toBe(-900);
		expect(normCurrent(-900_000, "Discharging")).toBe(-900);
		expect(normCurrent(-900_000, "Full")).toBe(900);
	});

	it("keeps the raw sign when status carries no direction", () => {
		expect(normCurrent(-5_000, "Not charging")).toBe(-5);
		expect(normCurrent(5_000, "Unknown")).toBe(5);
	});

	it("passes null through", () => {
		expect(normCurrent(null, "Discharging")).toBeNull();
	});
});

describe("parseRow", () => {
	it("converts sysfs units to display units", () => {
		const r = parseRow(line())!;
		expect(r.t).toBe(1_700_000_000);
		expect(r.pct).toBe(63);
		expect(r.tempC).toBeCloseTo(31.2);
		expect(r.voltageV).toBeCloseTo(3.98);
		expect(r.mA).toBe(-920);
	});

	it("maps missing nodes to null, not 0", () => {
		const r = parseRow(line({ temp_dc: "", voltage_uv: "", current_ua: "", capacity: "" }))!;
		expect(r.tempC).toBeNull();
		expect(r.voltageV).toBeNull();
		expect(r.mA).toBeNull();
		expect(r.pct).toBeNull();
	});

	it("tolerates truncated lines", () => {
		const r = parseRow("1700000000,2023-11-14T22:13:20+0100,63,Discharging")!;
		expect(r.pct).toBe(63);
		expect(r.tempC).toBeNull();
		expect(r.charge_full).toBe("");
	});

	it("rejects lines without a usable epoch", () => {
		expect(parseRow("")).toBeNull();
		expect(parseRow("not-a-number,x,50")).toBeNull();
	});
});

describe("parseLog", () => {
	it("drops the header, skips junk and sorts by time", () => {
		const text = [
			CSV_HEADER,
			line({ epoch: 300 }),
			"",
			"garbage",
			line({ epoch: 100 }),
			line({ epoch: 200 }),
		].join("\n");
		expect(parseLog(text).map((r) => r.t)).toEqual([100, 200, 300]);
	});

	it("handles an empty log", () => {
		expect(parseLog("")).toEqual([]);
		expect(parseLog(`${CSV_HEADER}\n`)).toEqual([]);
	});
});

describe("parseConfig", () => {
	it("defaults when the file is missing or empty", () => {
		expect(parseConfig("")).toEqual({ enabled: true, interval: 60 });
	});

	it("reads both keys", () => {
		expect(parseConfig("LOG_ENABLED=0\nLOG_INTERVAL=300\n")).toEqual({
			enabled: false, interval: 300,
		});
	});

	it("keeps the other default when the config is partial", () => {
		expect(parseConfig("LOG_ENABLED=0\n")).toEqual({ enabled: false, interval: 60 });
		expect(parseConfig("LOG_INTERVAL=15\n")).toEqual({ enabled: true, interval: 15 });
	});

	it("rejects an interval below the daemon's floor", () => {
		expect(parseConfig("LOG_INTERVAL=1\n").interval).toBe(60);
	});
});

describe("parseDaemonPid", () => {
	it("reads the pid pgrep printed", () => {
		expect(parseDaemonPid("4321\n")).toBe(4321);
		expect(parseDaemonPid("  4321  ")).toBe(4321);
	});

	it("takes the first pid when several matched", () => {
		expect(parseDaemonPid("4321\n4322\n")).toBe(4321);
	});

	it("reports no daemon when nothing was printed", () => {
		// pgrep exits 1 and prints nothing when it matches no process; a shell
		// without pgrep at all prints nothing either. Both mean "not running".
		expect(parseDaemonPid("")).toBeNull();
		expect(parseDaemonPid("\n \n")).toBeNull();
	});

	it("rejects output that is not a pid", () => {
		// A stray warning on stdout must never read as a live daemon.
		expect(parseDaemonPid("pgrep: bad usage\n")).toBeNull();
		expect(parseDaemonPid("0\n")).toBeNull();
		expect(parseDaemonPid("-1\n")).toBeNull();
		expect(parseDaemonPid("12.5\n")).toBeNull();
	});
});

describe("derive", () => {
	it("returns nulls with no data at all", () => {
		const d = derive([], null);
		expect(d.pct).toBeNull();
		expect(d.status).toBe("Unknown");
		expect(d.ratePerHour).toBeNull();
		expect(d.eta).toBeNull();
	});

	it("prefers the live sample over the newest logged row", () => {
		const live = parseRow(line({ epoch: 999, capacity: 41 }))!;
		expect(derive([row(100, 90)], live).pct).toBe(41);
		expect(derive([row(100, 90)], null).pct).toBe(90);
	});

	it("computes health % from charge_full / charge_full_design", () => {
		const live = parseRow(line({ charge_full: 4_210_000, charge_full_design: 4_500_000 }))!;
		expect(derive([], live).healthPct).toBeCloseTo(93.56, 1);
	});

	it("leaves health % null when the design capacity is missing", () => {
		const live = parseRow(line({ charge_full_design: "" }))!;
		expect(derive([], live).healthPct).toBeNull();
	});

	it("estimates time to empty while discharging", () => {
		// 50% -> 40% over 30 min = -20 %/h; 40% left -> 2h.
		const rows = [row(0, 50), row(1800, 40)];
		const d = derive(rows, rows[1]!);
		expect(d.ratePerHour).toBeCloseTo(-20);
		expect(d.eta).toBe("2h 0m to empty");
	});

	it("estimates time to full while charging", () => {
		// 40% -> 50% over 30 min = +20 %/h; 50% to go -> 2h30m.
		const rows = [charging(0, 40), charging(1800, 50)];
		const d = derive(rows, rows[1]!);
		expect(d.ratePerHour).toBeCloseTo(20);
		expect(d.eta).toBe("2h 30m to full");
	});

	it("ignores the charge session that just ended", () => {
		// Unplugged one sample ago: the climb from 75% to 85% is over, and the
		// only thing the phone is doing now is draining.
		const rows = [
			charging(0, 75), charging(900, 80), charging(1500, 85),
			row(1800, 85), row(2400, 84),
		];
		const d = derive(rows, rows[4]!);
		expect(d.ratePerHour).toBeCloseTo(-6);
		expect(d.eta).toBe("14h 0m to empty");
	});

	it("shows no rate while discharging against a rising level", () => {
		// Level ticked up inside the discharge session (gauge rounding). A
		// positive rate — and a "to full" ETA — would contradict the current.
		const rows = [row(0, 84), row(1800, 85)];
		const d = derive(rows, rows[1]!);
		expect(d.ratePerHour).toBeNull();
		expect(d.eta).toBeNull();
	});

	it("carries the rate to the live sample", () => {
		// 50% -> 40% between the last logged row and the live read.
		const rows = [row(0, 50)];
		const d = derive(rows, row(1800, 40));
		expect(d.ratePerHour).toBeCloseTo(-20);
		expect(d.eta).toBe("2h 0m to empty");
	});

	it("gives no ETA inside the flat dead band", () => {
		// Level held steady across the window: a rate exists, but not a forecast.
		const rows = [row(0, 50), row(1800, 50)];
		const d = derive(rows, rows[1]!);
		expect(d.ratePerHour).toBe(0);
		expect(d.eta).toBeNull();
	});

	it("gives no rate when the whole window is stale", () => {
		// Nothing logged in the last 30 min (daemon paused) -> no extrapolation.
		const rows = [row(0, 50), row(86_400, 51)];
		expect(derive(rows, rows[1]!).ratePerHour).toBeNull();
	});

	it("measures the rate over the recent window, ignoring older history", () => {
		// A charge session 10h ago must not flatten the current drain estimate.
		const rows = [row(0, 20), row(36_000, 100), row(37_800, 90)];
		const d = derive(rows, rows[2]!);
		expect(d.ratePerHour).toBeCloseTo(-20);
	});

	it("needs at least two samples for a rate", () => {
		expect(derive([row(0, 50)], null).ratePerHour).toBeNull();
	});
});

describe("filterByRange", () => {
	const rows = [row(0, 50), row(3600, 49), row(7200, 48)];

	it("measures the window back from the newest sample", () => {
		expect(filterByRange(rows, 1).map((r) => r.t)).toEqual([3600, 7200]);
	});

	it("returns everything for range 0", () => {
		expect(filterByRange(rows, 0)).toHaveLength(3);
	});

	it("handles an empty log", () => {
		expect(filterByRange([], 24)).toEqual([]);
	});
});

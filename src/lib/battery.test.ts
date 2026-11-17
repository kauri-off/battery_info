import { describe, expect, it } from "vitest";
import {
	chartRows, derive, normCurrent, parseLog, parseRow, parseRows, parseState, thin,
} from "./battery";
import { CSV_HEADER, type Sample } from "./types";

type Fields = Partial<Record<string, string | number>>;

function line(over: Fields = {}): string {
	const f = {
		epoch: 1_700_000_000, iso: "2023-11-14T22:13:20+0100", capacity: 63,
		status: "Discharging", voltage_uv: 3_980_000, current_ua: -920_000,
		temp_dc: 312, charge_counter_uah: "", cycle_count: 137,
		health: "Good", charge_full: 4_210_000, charge_full_design: 4_500_000,
		...over,
	};
	return [
		f.epoch, f.iso, f.capacity, f.status, f.voltage_uv, f.current_ua, f.temp_dc,
		f.charge_counter_uah, f.cycle_count, f.health, f.charge_full, f.charge_full_design,
	].join(",");
}

const row = (t: number, pct: number, over: Fields = {}): Sample =>
	parseRow(line({ epoch: t, capacity: pct, ...over }))!;

const charging = (t: number, pct: number): Sample =>
	row(t, pct, { status: "Charging", current_ua: 1_200_000 });

describe("normCurrent", () => {
	it("forces the sign from status, whatever the device reports", () => {
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
		const r = parseRow(line({ charge_counter_uah: 2_646_000 }))!;
		expect(r.t).toBe(1_700_000_000);
		expect(r.pct).toBe(63);
		expect(r.tempC).toBeCloseTo(31.2);
		expect(r.voltageV).toBeCloseTo(3.98);
		expect(r.mA).toBe(-920);
		expect(r.chargeUah).toBe(2_646_000);
		expect(r.cycles).toBe(137);
		expect(r.fullUah).toBe(4_210_000);
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
		expect(r.fullUah).toBeNull();
	});

	it("rejects lines without a usable epoch", () => {
		expect(parseRow("")).toBeNull();
		expect(parseRow(CSV_HEADER)).toBeNull();
		expect(parseRow("not-a-number,x,50")).toBeNull();
	});
});

describe("parseRows", () => {
	it("skips junk and sorts by time", () => {
		const rows = parseRows([CSV_HEADER, line({ epoch: 300 }), "garbage", line({ epoch: 100 })]);
		expect(rows.map((r) => r.t)).toEqual([100, 300]);
	});
});

describe("thin", () => {
	const rows = [0, 10, 20, 30, 40, 50, 60, 70].map((t) => row(t, 50));

	it("keeps the first row of each bucket and always the newest", () => {
		expect(thin(rows, 30, Infinity).map((r) => r.t)).toEqual([0, 30, 60, 70]);
	});

	it("never thins the dense tail", () => {
		expect(thin(rows, 30, 45).map((r) => r.t)).toEqual([0, 30, 50, 60, 70]);
	});

	it("leaves rows alone when the bucket is a single second", () => {
		expect(thin(rows, 1, Infinity)).toBe(rows);
	});
});

describe("parseLog", () => {
	it("reads rows and metadata", () => {
		const log = parseLog([
			"#now=1000", "#from=400", "#bucket=2", "#bytes=5180217",
			line({ epoch: 500 }), line({ epoch: 900 }),
			"#rows=50589", "#total=762", "",
		].join("\n"));
		expect(log.rows.map((r) => r.t)).toEqual([500, 900]);
		expect(log).toMatchObject({ now: 1000, from: 400, total: 762, fileRows: 50589, fileBytes: 5180217 });
	});

	it("windows and thins a raw dump itself", () => {
		const epochs = [100, 5000, 5010, 5020, 5100, 9000, 9500];
		const log = parseLog([
			"#now=10000", "#from=5000", "#bucket=100", "#bytes=1", "#raw=1",
			CSV_HEADER, ...epochs.map((epoch) => line({ epoch })),
		].join("\n"));
		expect(log.rows.map((r) => r.t)).toEqual([5000, 5100, 9000, 9500]);
		expect(log.fileRows).toBe(7);
		expect(log.total).toBe(6);
	});

	it("handles an empty log", () => {
		const log = parseLog("#now=1000\n#from=1000\n#bucket=1\n#bytes=120\n#rows=0\n#total=0\n");
		expect(log.rows).toEqual([]);
		expect(log.total).toBe(0);
	});
});

describe("parseState", () => {
	it("reads every field", () => {
		const s = parseState([
			"config=0,300",
			"daemon=4321 4400",
			`row=${line({ epoch: 2000, capacity: 41 })}`,
			`last=${line({ epoch: 1950 })}`,
		].join("\n"));
		expect(s.config).toEqual({ enabled: false, interval: 300 });
		expect(s.daemonPids).toEqual([4321, 4400]);
		expect(s.live?.pct).toBe(41);
		expect(s.lastLogged?.t).toBe(1950);
	});

	it("reports no daemon when pgrep printed nothing", () => {
		expect(parseState("config=1,60\ndaemon=\n").daemonPids).toEqual([]);
	});

	it("never reads a stray word as a live daemon", () => {
		expect(parseState("daemon=pgrep: bad usage 0 -1 12.5\n").daemonPids).toEqual([]);
	});

	it("has no last sample while the log holds only its header", () => {
		expect(parseState(`last=${CSV_HEADER}\n`).lastLogged).toBeNull();
	});

	it("falls back to defaults", () => {
		expect(parseState("").config).toEqual({ enabled: true, interval: 60 });
		expect(parseState("config=1,2\n").config.interval).toBe(60);
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
		expect(derive([row(100, 90)], row(999, 41)).pct).toBe(41);
		expect(derive([row(100, 90)], null).pct).toBe(90);
	});

	it("computes health % from charge_full / charge_full_design", () => {
		expect(derive([], row(0, 50)).healthPct).toBeCloseTo(93.56, 1);
	});

	it("leaves health % null when the design capacity is missing", () => {
		expect(derive([], row(0, 50, { charge_full_design: "" })).healthPct).toBeNull();
	});

	it("estimates time to empty while discharging", () => {
		const rows = [row(0, 50), row(1800, 40)];
		const d = derive(rows, rows[1]!);
		expect(d.ratePerHour).toBeCloseTo(-20);
		expect(d.eta).toEqual({ hours: 2, to: "empty" });
	});

	it("estimates time to full while charging", () => {
		const rows = [charging(0, 40), charging(1800, 50)];
		const d = derive(rows, rows[1]!);
		expect(d.ratePerHour).toBeCloseTo(20);
		expect(d.eta).toEqual({ hours: 2.5, to: "full" });
	});

	it("prefers the charge counter over the 1% steps of the level", () => {
		// The level has not ticked yet, but 105 mAh of 4210 left in 30 min.
		const rows = [
			row(0, 57, { charge_counter_uah: 2_400_000 }),
			row(1800, 57, { charge_counter_uah: 2_294_750 }),
		];
		const d = derive(rows, rows[1]!);
		expect(d.ratePerHour).toBeCloseTo(-5);
		expect(d.eta?.hours).toBeCloseTo(11.4);
	});

	it("ignores a charge counter that moves faster than any charger", () => {
		const rows = [
			row(0, 50, { charge_counter_uah: 20_000_000 }),
			row(1800, 40, { charge_counter_uah: 0 }),
		];
		expect(derive(rows, rows[1]!).ratePerHour).toBeCloseTo(-20);
	});

	it("ignores the charge session that just ended", () => {
		const rows = [
			charging(0, 75), charging(900, 80), charging(1500, 85),
			row(1800, 85), row(2400, 84),
		];
		const d = derive(rows, rows[4]!);
		expect(d.ratePerHour).toBeCloseTo(-6);
		expect(d.eta).toEqual({ hours: 14, to: "empty" });
	});

	it("shows no rate while discharging against a rising level", () => {
		const rows = [row(0, 84), row(1800, 85)];
		const d = derive(rows, rows[1]!);
		expect(d.ratePerHour).toBeNull();
		expect(d.eta).toBeNull();
	});

	it("shows no rate until the session is a few minutes old", () => {
		// Unplugged 10 s ago: one tick over 10 s is not -360 %/h.
		const rows = [charging(0, 85), row(1790, 85), row(1800, 84)];
		const d = derive(rows, rows[2]!);
		expect(d.ratePerHour).toBeNull();
		expect(d.eta).toBeNull();
	});

	it("carries the rate to the live sample", () => {
		const d = derive([row(0, 50)], row(1800, 40));
		expect(d.ratePerHour).toBeCloseTo(-20);
		expect(d.eta).toEqual({ hours: 2, to: "empty" });
	});

	it("gives no ETA inside the flat dead band", () => {
		const rows = [row(0, 50), row(1800, 50)];
		const d = derive(rows, rows[1]!);
		expect(d.ratePerHour).toBe(0);
		expect(d.eta).toBeNull();
	});

	it("gives no ETA to full once the battery is full", () => {
		const full = { status: "Full", charge_counter_uah: 4_210_000 };
		const rows = [charging(0, 99), row(1800, 100, full)];
		expect(derive(rows, rows[1]!).eta).toBeNull();
	});

	it("gives no rate when the whole window is stale", () => {
		const rows = [row(0, 50), row(86_400, 51)];
		expect(derive(rows, rows[1]!).ratePerHour).toBeNull();
	});

	it("measures the rate over the recent window, ignoring older history", () => {
		const rows = [row(0, 20), row(36_000, 100), row(37_800, 90)];
		expect(derive(rows, rows[2]!).ratePerHour).toBeCloseTo(-20);
	});

	it("needs at least two samples for a rate", () => {
		expect(derive([row(0, 50)], null).ratePerHour).toBeNull();
	});
});

describe("chartRows", () => {
	const rows = [row(0, 50), row(3600, 49), row(7200, 48)];

	it("clips to the window and ends on the live sample", () => {
		const out = chartRows(rows, row(7300, 47), 3600);
		expect(out.map((r) => r.t)).toEqual([3600, 7200, 7300]);
	});

	it("does not repeat a live sample the log already holds", () => {
		expect(chartRows(rows, row(7200, 48), 0)).toHaveLength(3);
	});

	it("handles an empty log", () => {
		expect(chartRows([], null, 0)).toEqual([]);
	});
});

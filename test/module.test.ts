// Runs the module's real shell scripts against a fake sysfs and data dir.
// TEST_SH picks the shell, e.g. TEST_SH="busybox sh" or TEST_SH=mksh.

import { spawnSync } from "node:child_process";
import {
	cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, DENSE_S, MIN_INTERVAL, parseLog, parseState } from "../src/lib/battery";
import { CSV_HEADER } from "../src/lib/types";

const SHELL = (process.env.TEST_SH ?? "sh").split(" ");
const ROOT = mkdtempSync(path.join(tmpdir(), "battery-info-"));
const MODULE = path.join(ROOT, "module");
const DATA = path.join(ROOT, "data");
const PS = path.join(ROOT, "power_supply");
const EXPORTS = path.join(ROOT, "exports");
const CONFIG = path.join(DATA, "config.sh");
const CSV = path.join(DATA, "battery.csv");
const COMMON = path.join(MODULE, "scripts/battery_common.sh");

cpSync(path.resolve(import.meta.dirname, "../module"), MODULE, { recursive: true });

const env = {
	PATH: process.env.PATH ?? "",
	BATTERY_INFO_MODULE_DIR: MODULE,
	BATTERY_INFO_DATA_DIR: DATA,
	BATTERY_INFO_PS_ROOT: PS,
	BATTERY_INFO_EXPORT_DIR: EXPORTS,
};

function run(args: string[]) {
	const [bin, ...pre] = SHELL;
	const r = spawnSync(bin!, [...pre, ...args], { env, encoding: "utf8", timeout: 15_000 });
	return { code: r.status, out: r.stdout, err: r.stderr };
}

const webui = (...args: (string | number)[]) =>
	run([path.join(MODULE, "scripts/webui.sh"), ...args.map(String)]);

const common = (script: string) => run(["-c", `. "${COMMON}"; ${script}`]);

function supply(name: string, nodes: Record<string, string | number>) {
	mkdirSync(path.join(PS, name), { recursive: true });
	for (const [node, value] of Object.entries(nodes)) {
		writeFileSync(path.join(PS, name, node), `${value}\n`);
	}
}

const BATTERY = {
	capacity: 57, status: "Discharging", voltage_now: 3_923_000, current_now: 96_000,
	temp: 299, charge_counter: 2_407_000, cycle_count: 830, health: "Good",
	charge_full: 4_399_000, charge_full_design: 5_000_000,
};

const csvLine = (epoch: number, capacity = 50) =>
	`${epoch},2026-01-01T00:00:00+0000,${capacity},Discharging,3900000,100000,300,2400000,830,Good,4399000,5000000`;

function writeLog(epochs: number[]) {
	mkdirSync(DATA, { recursive: true });
	writeFileSync(CSV, `${[CSV_HEADER, ...epochs.map((e) => csvLine(e))].join("\n")}\n`);
}

const now = () => Math.floor(Date.now() / 1000);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const daemons = () => parseState(webui("state").out).daemonPids;

beforeEach(() => {
	common("stop_daemon");
	for (const dir of [DATA, PS, EXPORTS]) rmSync(dir, { recursive: true, force: true });
	supply("battery", BATTERY);
});

afterAll(() => {
	common("stop_daemon");
	rmSync(ROOT, { recursive: true, force: true });
});

describe("state", () => {
	it("creates the data dir and reports a live sample", () => {
		const r = webui("state");
		expect(r.code).toBe(0);
		expect(readFileSync(CONFIG, "utf8")).toBe("LOG_ENABLED=1\nLOG_INTERVAL=60\n");
		expect(readFileSync(CSV, "utf8")).toBe(`${CSV_HEADER}\n`);

		const state = parseState(r.out);
		expect(state.config).toEqual({ enabled: true, interval: 60 });
		expect(state.daemonPids).toEqual([]);
		expect(state.lastLogged).toBeNull();
		expect(state.live).toMatchObject({
			pct: 57, status: "Discharging", mA: -96, tempC: 29.9, cycles: 830,
			health: "Good", chargeUah: 2_407_000, fullUah: 4_399_000, designUah: 5_000_000,
		});
		expect(Math.abs(state.live!.t - now())).toBeLessThan(5);
	});

	it("writes the same columns the WebUI parses", () => {
		expect(common('printf %s "$CSV_HEADER"').out).toBe(CSV_HEADER);
		const row = common('sample && printf %s "$ROW"').out;
		expect(row.split(",")).toHaveLength(CSV_HEADER.split(",").length);
		expect(row).toMatch(/^\d+,\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d{4},57,Discharging,/);
	});

	it("shares its constants with the WebUI", () => {
		const out = common('printf "%s %s %s" "$DENSE_S" "$MIN_INTERVAL" "$DEFAULT_INTERVAL"').out;
		expect(out).toBe(`${DENSE_S} ${MIN_INTERVAL} ${DEFAULT_CONFIG.interval}`);
	});

	it("logs missing nodes as empty fields", () => {
		rmSync(path.join(PS, "battery/temp"));
		rmSync(path.join(PS, "battery/charge_counter"));
		const live = parseState(webui("state").out).live!;
		expect(live.tempC).toBeNull();
		expect(live.chargeUah).toBeNull();
		expect(live.pct).toBe(57);
	});

	it("reports the newest logged sample", () => {
		writeLog([1000, 2000]);
		expect(parseState(webui("state").out).lastLogged?.t).toBe(2000);
	});

	it("omits the live sample when there is no battery", () => {
		rmSync(PS, { recursive: true });
		const r = webui("state");
		expect(r.code).toBe(0);
		expect(parseState(r.out).live).toBeNull();
	});
});

describe("find_ps", () => {
	const found = () => path.basename(common('find_ps; printf %s "$PS_DIR"').out);

	it("falls back to google_battery", () => {
		rmSync(PS, { recursive: true });
		supply("google_battery", BATTERY);
		expect(found()).toBe("google_battery");
	});

	it("skips the battery of a peripheral", () => {
		rmSync(PS, { recursive: true });
		supply("a-stylus", { capacity: 80, type: "Battery", scope: "Device" });
		supply("bms", { capacity: 57, type: "BMS" });
		supply("main", { capacity: 57, type: "Battery", scope: "System" });
		expect(found()).toBe("main");
	});

	it("takes any supply with a capacity as the last resort", () => {
		rmSync(PS, { recursive: true });
		supply("usb", { type: "USB" });
		supply("bms", { capacity: 57, type: "BMS" });
		expect(found()).toBe("bms");
	});
});

describe("config", () => {
	it("round-trips through the file", () => {
		expect(webui("config", 0, 300).code).toBe(0);
		expect(readFileSync(CONFIG, "utf8")).toBe("LOG_ENABLED=0\nLOG_INTERVAL=300\n");
		expect(parseState(webui("state").out).config).toEqual({ enabled: false, interval: 300 });
	});

	it("clamps an interval below the floor", () => {
		webui("config", 0, 1);
		expect(parseState(webui("state").out).config.interval).toBe(5);
	});

	it("rejects a malformed interval and leaves the file alone", () => {
		webui("config", 0, 300);
		for (const bad of ["abc", "", "-5", "60;reboot", "1e3", "999999999"]) {
			expect(webui("config", 1, bad).code).not.toBe(0);
		}
		expect(readFileSync(CONFIG, "utf8")).toBe("LOG_ENABLED=0\nLOG_INTERVAL=300\n");
	});

	it("never executes the config file", () => {
		const marker = path.join(ROOT, "pwned");
		mkdirSync(DATA, { recursive: true });
		writeFileSync(CONFIG, [
			"LOG_ENABLED=0",
			`LOG_INTERVAL=30; touch ${marker}`,
			`$(touch ${marker})`,
			"exit 3",
			"if then fi (",
		].join("\n"));
		const r = webui("state");
		expect(r.code).toBe(0);
		expect(parseState(r.out).config).toEqual({ enabled: false, interval: 60 });
		expect(existsSync(marker)).toBe(false);
	});

	it("reads a config without a trailing newline", () => {
		mkdirSync(DATA, { recursive: true });
		writeFileSync(CONFIG, "LOG_ENABLED=0\nLOG_INTERVAL=120");
		expect(parseState(webui("state").out).config).toEqual({ enabled: false, interval: 120 });
	});
});

describe("log", () => {
	it("returns only the requested window", () => {
		const t = now();
		writeLog([t - 3 * 3600, t - 2 * 3600 - 60, t - 3000, t - 600, t - 10]);
		const log = parseLog(webui("log", 1, 600).out);
		expect(log.rows.map((r) => r.t)).toEqual([t - 3000, t - 600, t - 10]);
		expect(log.total).toBe(3);
		expect(log.fileRows).toBe(5);
		expect(log.fileBytes).toBe(readFileSync(CSV).length);
		expect(Math.abs(log.now - t)).toBeLessThan(5);
		expect(Math.abs(log.from - (t - 3600))).toBeLessThan(5);
	});

	it("thins a long window but keeps the recent tail whole", () => {
		const t = now();
		const epochs: number[] = [];
		for (let e = t - 24 * 3600; e <= t; e += 60) epochs.push(e);
		writeLog(epochs);

		const log = parseLog(webui("log", 24, 100).out);
		const dense = log.rows.filter((r) => r.t >= log.now - DENSE_S);
		const sparse = log.rows.filter((r) => r.t < log.now - DENSE_S);
		expect(log.total).toBeGreaterThanOrEqual(1440);
		expect(dense.length).toBeGreaterThanOrEqual(29);
		expect(sparse.length).toBeGreaterThan(90);
		expect(sparse.length).toBeLessThanOrEqual(101);
		expect(log.rows.at(-1)!.t).toBe(epochs.at(-1));
	});

	it("spans the whole log for range 0", () => {
		const t = now();
		const first = t - 400 * 86400;
		const epochs: number[] = [];
		for (let e = first; e <= t - 86400; e += 3600) epochs.push(e);
		writeLog(epochs);

		const log = parseLog(webui("log", 0, 200).out);
		expect(log.from).toBe(first);
		expect(log.total).toBe(epochs.length);
		expect(log.rows[0]!.t).toBe(first);
		expect(log.rows.at(-1)!.t).toBe(epochs.at(-1));
		expect(log.rows.length).toBeLessThanOrEqual(201);
	});

	it("agrees with the WebUI's own thinning when there is no awk", () => {
		const t = now();
		const epochs: number[] = [];
		for (let e = t - 6 * 3600; e <= t; e += 30) epochs.push(e);
		writeLog(epochs);

		const viaAwk = parseLog(webui("log", 6, 50).out);
		const raw = common("pick_awk() { AWK=; }; log_window 6 50").out;
		expect(raw).toContain("#raw=1");
		const viaJs = parseLog(raw);
		// The two reads straddle a second at worst, which can move one bucket edge.
		expect(Math.abs(viaJs.rows.length - viaAwk.rows.length)).toBeLessThanOrEqual(2);
		expect(viaJs.total).toBe(viaAwk.total);
		expect(viaJs.fileRows).toBe(viaAwk.fileRows);
	});

	it("handles an empty log", () => {
		const log = parseLog(webui("log", 24, 600).out);
		expect(log.rows).toEqual([]);
		expect(log.total).toBe(0);
		expect(log.fileRows).toBe(0);
	});

	it("rejects malformed arguments", () => {
		expect(webui("log", "x", 600).code).not.toBe(0);
		expect(webui("log", 24, 0).code).not.toBe(0);
		expect(webui("log", 24).code).not.toBe(0);
	});
});

describe("clear and export", () => {
	it("clears the log down to its header", () => {
		writeLog([1000, 2000]);
		expect(webui("clear").code).toBe(0);
		expect(readFileSync(CSV, "utf8")).toBe(`${CSV_HEADER}\n`);
	});

	it("exports a copy and names it on the last line", () => {
		writeLog([1000, 2000]);
		const r = webui("export");
		expect(r.code).toBe(0);
		expect(r.out).toContain("Exported 2 samples");
		const file = r.out.trim().split("\n").pop()!;
		expect(path.dirname(file)).toBe(EXPORTS);
		expect(readFileSync(file, "utf8")).toBe(readFileSync(CSV, "utf8"));
		expect(readdirSync(EXPORTS)).toHaveLength(1);
	});

	it("explains an empty log on stdout instead of exporting it", () => {
		const r = webui("export");
		expect(r.code).toBe(1);
		expect(r.out).toContain("empty");
		expect(existsSync(EXPORTS)).toBe(false);
	});

	it("exports through the Action button too", () => {
		writeLog([1000]);
		const r = run([path.join(MODULE, "action.sh")]);
		expect(r.code).toBe(0);
		expect(readdirSync(EXPORTS)).toHaveLength(1);
	});
});

describe("daemon", () => {
	const logged = () => readFileSync(CSV, "utf8").trim().split("\n").length - 1;

	async function until(check: () => boolean, ms = 5000) {
		const deadline = Date.now() + ms;
		while (!check() && Date.now() < deadline) await sleep(100);
		expect(check()).toBe(true);
	}

	it("starts once, samples, and survives a second start", async () => {
		expect(webui("start").code).toBe(0);
		await until(() => daemons().length === 1);
		const [pid] = daemons();
		await until(() => logged() >= 1);

		expect(webui("start").code).toBe(0);
		expect(daemons()).toEqual([pid]);
	});

	it("restarts as a new process", async () => {
		webui("start");
		await until(() => daemons().length === 1);
		const [before] = daemons();

		expect(webui("restart").code).toBe(0);
		await until(() => daemons().length === 1 && daemons()[0] !== before);
	});

	it("starts the daemon when logging is enabled, not when it is paused", async () => {
		webui("config", 0, 60);
		expect(daemons()).toEqual([]);
		webui("config", 1, 60);
		await until(() => daemons().length === 1);
	});

	it("records nothing while paused and resumes without a restart", async () => {
		webui("config", 0, 5);
		webui("start");
		await until(() => daemons().length === 1);
		await sleep(700);
		expect(logged()).toBe(0);

		webui("config", 1, 5);
		await until(() => logged() >= 1, 9000);
	}, 15_000);

	it("keeps running on a config it cannot parse", async () => {
		mkdirSync(DATA, { recursive: true });
		writeFileSync(CONFIG, "LOG_INTERVAL=5\nif then fi (\nexit 1\n");
		webui("start");
		await until(() => logged() >= 1);
		expect(daemons()).toHaveLength(1);
	});

	it("puts the header back if the log is deleted under it", async () => {
		webui("config", 1, 5);
		await until(() => logged() >= 1);
		rmSync(CSV);
		await until(() => existsSync(CSV) && logged() >= 1, 9000);
		expect(readFileSync(CSV, "utf8").startsWith(`${CSV_HEADER}\n`)).toBe(true);
	}, 15_000);
});

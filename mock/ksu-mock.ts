// ksu-mock.ts — desktop dev harness. Installs a fake `window.ksu` matching the
// real KernelSU WebUI bridge (see node_modules/kernelsu/index.js):
//   ksu.exec(command, optionsJson, callbackName)
//     -> window[callbackName](errno, stdout, stderr) some time later
// Imported only when import.meta.env.DEV, so it never reaches the module zip.

import { CSV_HEADER } from "../src/lib/types";

const SAMPLE_INTERVAL_S = 300;
const HISTORY_H = 24;
/** Latency of a real root-shell round trip, roughly. */
const BRIDGE_DELAY_MS = 30;

// Generate ~24h of samples with a charge session, so the charts, the rate and
// the ETA all have something realistic to chew on.
function makeCsv(): string {
	const rows = [CSV_HEADER];
	const now = Math.floor(Date.now() / 1000);
	const start = now - HISTORY_H * 3600;
	let cap = 82;
	let charging = false;

	for (let t = start; t <= now; t += SAMPLE_INTERVAL_S) {
		if (cap <= 20) charging = true;
		if (cap >= 100) charging = false;
		cap += charging ? 1.2 : -0.4 + (Math.random() - 0.5) * 0.2;
		cap = Math.max(2, Math.min(100, cap));

		const status = charging ? "Charging" : "Discharging";
		const ua = (charging ? 1 : -1) * (800 + Math.random() * 400) * 1000;
		const tempDc = Math.round((29 + Math.random() * 3 + (charging ? 2 : 0)) * 10);
		rows.push([
			t,
			new Date(t * 1000).toISOString(),
			Math.round(cap),
			status,
			4_100_000 - Math.round((100 - cap) * 4000),
			Math.round(ua),
			tempDc,
			Math.round(cap * 42_000),
			137,
			"Good",
			4_210_000,
			4_500_000,
		].join(","));
	}
	return `${rows.join("\n")}\n`;
}

let csv = makeCsv();
let config = "LOG_ENABLED=1\nLOG_INTERVAL=60\n";
// Stands in for the logger daemon. Flip it from the devtools console with
// __mockDaemon(false) to see the stopped state and the Start button.
let daemonPid: number | null = 4321;

// A live sample that drifts a little each poll, so the header actually moves.
// It continues from the last logged sample — on device the two are one interval
// apart, and a live value unrelated to the log makes the header contradict the
// end of every chart.
let liveCap = Number(csv.trim().split("\n").pop()!.split(",")[2]);
function liveRow(): string {
	liveCap = Math.max(2, liveCap - Math.random() * 0.05);
	const t = Math.floor(Date.now() / 1000);
	return `${[
		t, new Date(t * 1000).toISOString(), Math.round(liveCap), "Discharging",
		3_980_000, -920_000 + Math.round((Math.random() - 0.5) * 80_000), 312,
		2_646_000, 137, "Good", 4_210_000, 4_500_000,
	].join(",")}\n`;
}

type Result = { errno: number; stdout: string; stderr: string };
const ok = (stdout: string): Result => ({ errno: 0, stdout, stderr: "" });

function handle(command: string): Result {
	if (command.includes("read_row")) return ok(liveRow());
	if (command.includes("start_daemon")) {
		daemonPid ??= 4321;
		return ok("");
	}
	if (command.includes("daemon_pid")) return ok(daemonPid === null ? "" : `${daemonPid}\n`);
	if (command.startsWith("cat") && command.includes("battery.csv")) return ok(csv);
	if (command.startsWith("cat") && command.includes("config.sh")) return ok(config);

	if (command.includes("LOG_ENABLED") && command.includes("mv")) {
		const m = command.match(/LOG_INTERVAL=%s\\n'\s+(\d+)\s+(\d+)/);
		if (m) config = `LOG_ENABLED=${m[1]}\nLOG_INTERVAL=${m[2]}\n`;
		return ok("");
	}

	if (command.includes("action.sh")) {
		const samples = csv.trim().split("\n").length - 1;
		return ok(`Exported ${samples} samples to:\n/sdcard/Download/battery_info_mock.csv`);
	}

	// clearLog(): rewrite the file with just the header.
	if (command.startsWith("printf") && command.includes("battery.csv")) {
		csv = `${CSV_HEADER}\n`;
		return ok("");
	}

	console.warn("[ksu-mock] unhandled command:", command);
	return ok("");
}

declare global {
	interface Window {
		ksu: Record<string, (...args: never[]) => unknown>;
		__mockDaemon: (running: boolean) => void;
	}
}

window.__mockDaemon = (running: boolean) => {
	daemonPid = running ? 4321 : null;
	console.log("[ksu-mock] daemon", running ? "running" : "stopped");
};

window.ksu = {
	exec(command: string, _optionsJson: string, callbackName: string) {
		const { errno, stdout, stderr } = handle(command);
		setTimeout(() => {
			const cb = (window as unknown as Record<string, unknown>)[callbackName];
			if (typeof cb === "function") cb(errno, stdout, stderr);
		}, BRIDGE_DELAY_MS);
	},
	toast(message: string) {
		console.log("[toast]", message);
	},
	fullScreen(v: boolean) {
		console.log("[fullScreen]", v);
	},
	enableEdgeToEdge(v: boolean) {
		console.log("[enableEdgeToEdge]", v);
	},
	moduleInfo() {
		return "battery_info";
	},
	exit() {
		console.log("[exit]");
	},
	spawn() {
		console.warn("[ksu-mock] spawn is not mocked");
	},
} as unknown as Window["ksu"];

console.log("[ksu-mock] installed");

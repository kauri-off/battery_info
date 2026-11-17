// Dev only: a fake `window.ksu` that answers the verbs of module/scripts/webui.sh.

import { CSV_HEADER } from "../src/lib/types";

const SAMPLE_INTERVAL_S = 120;
const HISTORY_DAYS = 14;
const BRIDGE_DELAY_MS = 30;

const epoch = () => Math.floor(Date.now() / 1000);

function row(t: number, cap: number, charging: boolean): string {
	const ua = (charging ? 1 : -1) * (800 + Math.random() * 400) * 1000;
	const tempDc = Math.round((29 + Math.random() * 3 + (charging ? 2 : 0)) * 10);
	return [
		t,
		new Date(t * 1000).toISOString(),
		Math.round(cap),
		charging ? "Charging" : "Discharging",
		4_100_000 - Math.round((100 - cap) * 4000),
		Math.round(ua),
		tempDc,
		Math.round(cap * 42_100),
		137,
		"Good",
		4_210_000,
		4_500_000,
	].join(",");
}

let cap = 82;
let charging = false;

function step(seconds: number): void {
	if (cap <= 20) charging = true;
	if (cap >= 100) charging = false;
	const perHour = charging ? 45 : -8 + (Math.random() - 0.5) * 4;
	cap = Math.max(2, Math.min(100, cap + (perHour * seconds) / 3600));
}

function makeRows(): string[] {
	const rows: string[] = [];
	const now = epoch();
	for (let t = now - HISTORY_DAYS * 86400; t <= now - SAMPLE_INTERVAL_S; t += SAMPLE_INTERVAL_S) {
		step(SAMPLE_INTERVAL_S);
		rows.push(row(t, cap, charging));
	}
	return rows;
}

let rows = makeRows();
let config = { enabled: 1, interval: 60 };
let nextPid = 4321;
let daemon: number[] = [nextPid++];
let lastLive = epoch();

function liveRow(): string {
	const t = epoch();
	step(t - lastLive);
	lastLive = t;
	return row(t, cap, charging);
}

const csv = () => `${[CSV_HEADER, ...rows].join("\n")}\n`;

type Result = { errno: number; stdout: string; stderr: string };
const ok = (stdout = ""): Result => ({ errno: 0, stdout, stderr: "" });
const fail = (errno: number, stdout: string, stderr = ""): Result => ({ errno, stdout, stderr });

function handle(command: string): Result {
	const [verb, ...args] = command.split("webui.sh ")[1]?.split(" ") ?? [];
	switch (verb) {
		case "state":
			return ok([
				`config=${config.enabled},${config.interval}`,
				`daemon=${daemon.join(" ")}`,
				`row=${liveRow()}`,
				`last=${rows.at(-1) ?? CSV_HEADER}`,
			].join("\n"));
		case "log": {
			const [hours, points] = args.map(Number) as [number, number];
			const now = epoch();
			const from = hours ? now - hours * 3600 : Number(rows[0]?.split(",")[0] ?? now);
			const bucket = Math.max(1, Math.floor((now - from) / points));
			const text = csv();
			return ok(`#now=${now}\n#from=${from}\n#bucket=${bucket}\n#bytes=${text.length}\n#raw=1\n${text}`);
		}
		case "config":
			config = { enabled: Number(args[0]), interval: Number(args[1]) };
			if (config.enabled && !daemon.length) daemon = [nextPid++];
			return ok();
		case "start":
			if (!daemon.length) daemon = [nextPid++];
			return ok();
		case "restart":
			daemon = [nextPid++];
			return ok();
		case "clear":
			rows = [];
			return ok();
		case "export":
			return rows.length
				? ok(`Exported ${rows.length} samples to\n/sdcard/Download/battery_info_mock.csv\n`)
				: fail(1, "The log is empty: no samples recorded yet.\n");
		default:
			return fail(2, "", `[ksu-mock] unhandled command: ${command}`);
	}
}

declare global {
	interface Window {
		ksu: Record<string, (...args: never[]) => unknown>;
		/** Number of logger daemons to pretend are running: 0, 1 or more. */
		__mockDaemons: (count: number) => void;
	}
}

window.__mockDaemons = (count: number) => {
	daemon = Array.from({ length: count }, () => nextPid++);
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
	enableEdgeToEdge() {},
} as unknown as Window["ksu"];

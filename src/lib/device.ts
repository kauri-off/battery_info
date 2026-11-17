import { parseLog, parseState } from "./battery";
import { sh } from "./ksu";
import type { Config, DeviceState, LogWindow, RangeHours } from "./types";

const API = "sh /data/adb/modules/battery_info/scripts/webui.sh";

const uint = (n: number) => {
	if (!Number.isSafeInteger(n) || n < 0) throw new Error(`Not a whole number: ${n}`);
	return String(n);
};

export async function readState(): Promise<DeviceState> {
	return parseState(await sh(`${API} state`));
}

export async function readLog(hours: RangeHours, points: number): Promise<LogWindow> {
	return parseLog(await sh(`${API} log ${uint(hours)} ${uint(points)}`));
}

// Enabling also starts the daemon, so "on" always means something is sampling.
export async function writeConfig({ enabled, interval }: Config): Promise<void> {
	await sh(`${API} config ${enabled ? 1 : 0} ${uint(interval)}`);
}

export async function startDaemon(): Promise<void> {
	await sh(`${API} start`);
}

export async function restartDaemon(): Promise<void> {
	await sh(`${API} restart`);
}

export async function clearLog(): Promise<void> {
	await sh(`${API} clear`);
}

/** Resolves to the path of the exported file. */
export async function exportCsv(): Promise<string> {
	const out = await sh(`${API} export`);
	return out.trim().split("\n").pop() ?? "";
}

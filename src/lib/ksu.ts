// ksu.ts — typed access to the KernelSU WebUI bridge. Everything that talks to
// the device goes through here.

import { exec, toast as ksuToast, enableEdgeToEdge, moduleInfo } from "kernelsu";

export const MODULE_ID = "battery_info";

// Run a shell command as root, returning stdout. Throws on a non-zero errno.
export async function sh(cmd: string): Promise<string> {
	const { errno, stdout, stderr } = await exec(cmd);
	if (errno !== 0) {
		throw new Error(stderr || `command failed (errno ${errno}): ${cmd}`);
	}
	return stdout;
}

// Single-quote a value for safe embedding in a shell command.
export function q(v: string | number): string {
	return `'${String(v).replace(/'/g, `'\\''`)}'`;
}

// The 3.x-only APIs below are absent on older managers, which throw on the
// missing native method — never let that take the whole UI down.

export function toast(message: string): void {
	try {
		ksuToast(message);
	} catch {
		/* manager without a toast bridge */
	}
}

export function requestEdgeToEdge(): void {
	try {
		enableEdgeToEdge(true);
	} catch {
		/* pre-3.x manager: the CSS safe-area insets still apply */
	}
}

// The manager reports the id it launched us under; fall back to the literal so
// paths still resolve if the API is missing.
export function currentModuleId(): string {
	try {
		return moduleInfo() || MODULE_ID;
	} catch {
		return MODULE_ID;
	}
}

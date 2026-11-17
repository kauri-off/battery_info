import { enableEdgeToEdge, exec, toast as ksuToast } from "kernelsu";

const TIMEOUT_MS = 20_000;

// Run a command as root and return stdout; rejects on a non-zero exit.
export async function sh(cmd: string): Promise<string> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error("The root shell did not answer.")), TIMEOUT_MS);
	});
	try {
		const { errno, stdout, stderr } = await Promise.race([exec(cmd), timeout]);
		if (errno !== 0) {
			throw new Error(stderr.trim() || stdout.trim() || `Command failed with exit code ${errno}.`);
		}
		return stdout;
	} catch (e) {
		if (e instanceof ReferenceError) {
			throw new Error("No KernelSU bridge: open this page from the manager.");
		}
		throw e;
	} finally {
		clearTimeout(timer);
	}
}

// Older managers lack these bridges and throw; the UI works without them.

export function toast(message: string): void {
	try {
		ksuToast(message);
	} catch {
		/* no toast bridge */
	}
}

export function requestEdgeToEdge(): void {
	try {
		enableEdgeToEdge(true);
	} catch {
		/* the CSS safe-area insets still apply */
	}
}

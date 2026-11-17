import { useEffect } from "react";

// Calls fn now and every `ms` while the page is visible; restarts when fn changes.
export function usePolling(fn: () => Promise<void>, ms: number): void {
	useEffect(() => {
		let timer: ReturnType<typeof setInterval> | undefined;
		let running = false;

		const run = async () => {
			if (running) return;
			running = true;
			try {
				await fn();
			} finally {
				running = false;
			}
		};
		const start = () => {
			if (document.hidden || timer !== undefined) return;
			void run();
			timer = setInterval(run, ms);
		};
		const stop = () => {
			clearInterval(timer);
			timer = undefined;
		};
		const onVisibility = () => (document.hidden ? stop() : start());

		start();
		document.addEventListener("visibilitychange", onVisibility);
		return () => {
			stop();
			document.removeEventListener("visibilitychange", onVisibility);
		};
	}, [fn, ms]);
}

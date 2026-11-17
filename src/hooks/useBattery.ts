import { useCallback, useRef, useState } from "react";
import {
	clearLog, exportCsv, readLog, readState, restartDaemon, startDaemon, writeConfig,
} from "../lib/device";
import type { Config, DeviceState, LogWindow, RangeHours } from "../lib/types";
import { usePolling } from "./usePolling";

const STATE_POLL_MS = 3_000;
const LOG_POLL_MS = 30_000;
/** Upper bound on the rows a chart draws, whatever the size of the log. */
const CHART_POINTS = 600;

type ErrorSource = "action" | "state" | "log";

export type UseBattery = {
	/** Null until the first read of the device resolves. */
	state: DeviceState | null;
	/** Null until the first read of the log resolves. */
	log: (LogWindow & { hours: RangeHours }) | null;
	error: string | null;
	dismissError: () => void;
	setConfig: (next: Config) => Promise<void>;
	start: () => Promise<void>;
	restart: () => Promise<void>;
	clear: () => Promise<void>;
	/** Resolves to the path of the exported file. */
	exportLog: () => Promise<string>;
};

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function useBattery(range: RangeHours): UseBattery {
	const [state, setState] = useState<DeviceState | null>(null);
	const [log, setLog] = useState<UseBattery["log"]>(null);
	const [errors, setErrors] = useState<Partial<Record<ErrorSource, string>>>({});

	// Only the newest request of each kind may write its answer into state.
	const stateSeq = useRef(0);
	const logSeq = useRef(0);
	const acting = useRef(0);

	const report = useCallback((source: ErrorSource, e: unknown | null) => {
		setErrors((prev) => {
			const { [source]: _, ...rest } = prev;
			return e === null ? rest : { ...rest, [source]: message(e) };
		});
	}, []);

	const refreshState = useCallback(async () => {
		const seq = ++stateSeq.current;
		try {
			const next = await readState();
			if (seq !== stateSeq.current) return;
			setState(next);
			report("state", null);
		} catch (e) {
			if (seq === stateSeq.current) report("state", e);
		}
	}, [report]);

	const refreshLog = useCallback(async () => {
		const seq = ++logSeq.current;
		try {
			const next = await readLog(range, CHART_POINTS);
			if (seq !== logSeq.current) return;
			setLog({ ...next, hours: range });
			report("log", null);
		} catch (e) {
			if (seq === logSeq.current) report("log", e);
		}
	}, [range, report]);

	// A poll racing an action would paint the state the action is replacing.
	const pollState = useCallback(async () => {
		if (acting.current === 0) await refreshState();
	}, [refreshState]);

	usePolling(pollState, STATE_POLL_MS);
	usePolling(refreshLog, LOG_POLL_MS);

	const act = useCallback(async <T,>(
		run: () => Promise<T>,
		optimistic?: (s: DeviceState) => DeviceState,
	): Promise<T> => {
		acting.current++;
		stateSeq.current++;
		if (optimistic) setState((s) => s && optimistic(s));
		try {
			const result = await run();
			report("action", null);
			return result;
		} catch (e) {
			report("action", e);
			throw e;
		} finally {
			acting.current--;
			await refreshState();
		}
	}, [refreshState, report]);

	const setConfig = useCallback(
		(next: Config) => act(() => writeConfig(next), (s) => ({ ...s, config: next })),
		[act],
	);
	const start = useCallback(() => act(startDaemon), [act]);
	const restart = useCallback(() => act(restartDaemon), [act]);
	const exportLog = useCallback(() => act(exportCsv), [act]);
	const clear = useCallback(
		() => act(async () => {
			await clearLog();
			await refreshLog();
		}),
		[act, refreshLog],
	);

	return {
		state,
		log,
		error: errors.action ?? errors.state ?? errors.log ?? null,
		dismissError: useCallback(() => setErrors({}), []),
		setConfig, start, restart, clear, exportLog,
	};
}

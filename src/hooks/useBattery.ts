// useBattery.ts — owns every device round-trip the dashboard makes: the live
// sample (fast poll), the log CSV (slow poll) and the daemon config.

import { useCallback, useEffect, useRef, useState } from "react";
import {
	clearLog, exportCsv, readConfig, readLive, readLog, writeConfig,
} from "../lib/battery";
import { DEFAULT_CONFIG } from "../lib/battery";
import type { BatteryRow, Config } from "../lib/types";

const LIVE_POLL_MS = 3_000;
const LOG_POLL_MS = 30_000;

export type UseBattery = {
	rows: BatteryRow[];
	live: BatteryRow | null;
	config: Config;
	error: string | null;
	/** True until the first log read resolves — drives the initial skeleton. */
	loading: boolean;
	/** True while a log refetch is in flight, so charts can dim in place. */
	refreshing: boolean;
	setConfig: (next: Config) => Promise<void>;
	clear: () => Promise<void>;
	exportLog: () => Promise<string>;
	dismissError: () => void;
};

export function useBattery(): UseBattery {
	const [rows, setRows] = useState<BatteryRow[]>([]);
	const [live, setLive] = useState<BatteryRow | null>(null);
	const [config, setConfigState] = useState<Config>(DEFAULT_CONFIG);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);

	// The bridge serializes shell calls; skip a tick rather than pile up when
	// a slow `cat` of a large CSV outlives its interval.
	const liveBusy = useRef(false);
	const logBusy = useRef(false);
	const mounted = useRef(true);

	const fail = useCallback((e: unknown) => {
		if (mounted.current) setError(e instanceof Error ? e.message : String(e));
	}, []);

	const refreshLog = useCallback(async () => {
		if (logBusy.current) return;
		logBusy.current = true;
		setRefreshing(true);
		try {
			const next = await readLog();
			if (mounted.current) {
				setRows(next);
				setError(null);
			}
		} catch (e) {
			fail(e);
		} finally {
			logBusy.current = false;
			if (mounted.current) {
				setRefreshing(false);
				setLoading(false);
			}
		}
	}, [fail]);

	const refreshLive = useCallback(async () => {
		if (liveBusy.current) return;
		liveBusy.current = true;
		try {
			const sample = await readLive();
			if (mounted.current) {
				setLive(sample);
				setError(null);
			}
		} catch (e) {
			fail(e);
		} finally {
			liveBusy.current = false;
		}
	}, [fail]);

	useEffect(() => {
		mounted.current = true;
		readConfig().then((c) => mounted.current && setConfigState(c)).catch(fail);
		void refreshLog();
		void refreshLive();
		const liveTimer = setInterval(refreshLive, LIVE_POLL_MS);
		const logTimer = setInterval(refreshLog, LOG_POLL_MS);
		return () => {
			mounted.current = false;
			clearInterval(liveTimer);
			clearInterval(logTimer);
		};
	}, [fail, refreshLive, refreshLog]);

	const setConfig = useCallback(async (next: Config) => {
		try {
			await writeConfig(next);
			setConfigState(next);
			setError(null);
		} catch (e) {
			fail(e);
			throw e;
		}
	}, [fail]);

	const clear = useCallback(async () => {
		try {
			await clearLog();
			setRows([]);
			setError(null);
			await refreshLog();
		} catch (e) {
			fail(e);
			throw e;
		}
	}, [fail, refreshLog]);

	const exportLog = useCallback(async () => {
		try {
			const msg = await exportCsv();
			setError(null);
			return msg;
		} catch (e) {
			fail(e);
			throw e;
		}
	}, [fail]);

	return {
		rows, live, config, error, loading, refreshing,
		setConfig, clear, exportLog,
		dismissError: () => setError(null),
	};
}

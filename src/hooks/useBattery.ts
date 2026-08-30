// useBattery.ts — owns every device round-trip the dashboard makes: the live
// sample (fast poll), the log CSV (slow poll) and the daemon config.

import { useCallback, useEffect, useRef, useState } from "react";
import {
	clearLog, exportCsv, readConfig, readDaemonPid, readLive, readLog,
	startDaemon, writeConfig,
} from "../lib/battery";
import { DEFAULT_CONFIG } from "../lib/battery";
import type { BatteryRow, Config } from "../lib/types";

const LIVE_POLL_MS = 3_000;
const LOG_POLL_MS = 30_000;

export type UseBattery = {
	rows: BatteryRow[];
	live: BatteryRow | null;
	config: Config;
	/** Pid of the running logger daemon, or null when nothing is sampling. */
	daemonPid: number | null;
	error: string | null;
	/** True until the first log read resolves — drives the initial skeleton. */
	loading: boolean;
	/** True while a log refetch is in flight, so charts can dim in place. */
	refreshing: boolean;
	setConfig: (next: Config) => Promise<void>;
	/** Spawn the daemon if one is not already running. */
	start: () => Promise<void>;
	clear: () => Promise<void>;
	exportLog: () => Promise<string>;
	dismissError: () => void;
};

export function useBattery(): UseBattery {
	const [rows, setRows] = useState<BatteryRow[]>([]);
	const [live, setLive] = useState<BatteryRow | null>(null);
	const [config, setConfigState] = useState<Config>(DEFAULT_CONFIG);
	const [daemonPid, setDaemonPid] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);

	// The bridge serializes shell calls; skip a tick rather than pile up when
	// a slow `cat` of a large CSV outlives its interval.
	const liveBusy = useRef(false);
	const logBusy = useRef(false);
	const daemonBusy = useRef(false);
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

	// Never routed through fail(): a daemon check that cannot run says "stopped",
	// which is what the badge should show anyway, and raising a banner for it
	// every poll would bury the errors that do need reading.
	const refreshDaemon = useCallback(async () => {
		if (daemonBusy.current) return;
		daemonBusy.current = true;
		try {
			const pid = await readDaemonPid();
			if (mounted.current) setDaemonPid(pid);
		} finally {
			daemonBusy.current = false;
		}
	}, []);

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
		void refreshDaemon();
		const liveTimer = setInterval(refreshLive, LIVE_POLL_MS);
		const logTimer = setInterval(refreshLog, LOG_POLL_MS);
		// The daemon's state only changes on a start, a kill or a reboot, so the
		// slow cadence is plenty — the paths that change it refresh it directly.
		const daemonTimer = setInterval(refreshDaemon, LOG_POLL_MS);
		return () => {
			mounted.current = false;
			clearInterval(liveTimer);
			clearInterval(logTimer);
			clearInterval(daemonTimer);
		};
	}, [fail, refreshDaemon, refreshLive, refreshLog]);

	const setConfig = useCallback(async (next: Config) => {
		try {
			await writeConfig(next);
			setConfigState(next);
			// Enabling logging has to mean logging happens. config.sh alone only
			// speaks to a daemon that is already running, so make sure one is.
			if (next.enabled) await startDaemon();
			setError(null);
		} catch (e) {
			fail(e);
			throw e;
		} finally {
			void refreshDaemon();
		}
	}, [fail, refreshDaemon]);

	const start = useCallback(async () => {
		try {
			await startDaemon();
			setError(null);
		} catch (e) {
			fail(e);
			throw e;
		} finally {
			void refreshDaemon();
		}
	}, [fail, refreshDaemon]);

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
		rows, live, config, daemonPid, error, loading, refreshing,
		setConfig, start, clear, exportLog,
		dismissError: () => setError(null),
	};
}

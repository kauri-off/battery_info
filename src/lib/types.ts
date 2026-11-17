export const COLUMNS = [
	"epoch", "iso", "capacity", "status", "voltage_uv", "current_ua",
	"temp_dc", "charge_counter_uah", "cycle_count", "health",
	"charge_full", "charge_full_design",
] as const;

export const CSV_HEADER = COLUMNS.join(",");

export type Sample = {
	/** epoch seconds */
	t: number;
	pct: number | null;
	status: string;
	/** positive while charging, negative while discharging */
	mA: number | null;
	tempC: number | null;
	voltageV: number | null;
	chargeUah: number | null;
	cycles: number | null;
	health: string;
	fullUah: number | null;
	designUah: number | null;
};

export type Config = {
	enabled: boolean;
	/** seconds between samples */
	interval: number;
};

export type DeviceState = {
	config: Config;
	daemonPids: number[];
	live: Sample | null;
	lastLogged: Sample | null;
};

/** Chart window in hours; 0 means the whole log. */
export type RangeHours = 1 | 6 | 24 | 168 | 0;

export type LogWindow = {
	rows: Sample[];
	/** device clock when the window was read, epoch seconds */
	now: number;
	from: number;
	/** samples inside the window before thinning */
	total: number;
	fileRows: number;
	fileBytes: number;
};

export type Eta = { hours: number; to: "empty" | "full" };

export type Stats = {
	pct: number | null;
	status: string;
	mA: number | null;
	tempC: number | null;
	voltageV: number | null;
	cycles: number | null;
	health: string | null;
	/** charge_full / charge_full_design, % */
	healthPct: number | null;
	/** signed %/h over the recent window */
	ratePerHour: number | null;
	eta: Eta | null;
};

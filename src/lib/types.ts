// types.ts — shapes shared across the data layer and the UI.

// Must match CSV_HEADER in module/scripts/battery_common.sh.
export const COLUMNS = [
	"epoch", "iso", "capacity", "status", "voltage_uv", "current_ua",
	"temp_dc", "charge_counter_uah", "cycle_count", "health",
	"charge_full", "charge_full_design",
] as const;

export const CSV_HEADER = COLUMNS.join(",");

export type Column = (typeof COLUMNS)[number];

// Raw CSV fields (always strings, "" when the sysfs node was missing) plus the
// normalized numeric fields parseRow() derives from them.
export type BatteryRow = Record<Column, string> & {
	/** epoch seconds */
	t: number;
	/** battery level, % */
	pct: number | null;
	/** temperature, °C */
	tempC: number | null;
	/** voltage, V */
	voltageV: number | null;
	/** current, mA — positive charging, negative discharging */
	mA: number | null;
};

export type Derived = {
	pct: number | null;
	status: string;
	mA: number | null;
	tempC: number | null;
	voltageV: number | null;
	cycleCount: number | null;
	health: string | null;
	/** charge_full / charge_full_design, % */
	healthPct: number | null;
	/** signed %/h over the recent window */
	ratePerHour: number | null;
	/** human string, e.g. "3h 12m to empty" */
	eta: string | null;
};

export type Config = {
	enabled: boolean;
	interval: number;
};

/** Chart window in hours; 0 means "all samples". */
export type RangeHours = 1 | 6 | 24 | 0;

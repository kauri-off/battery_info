import { describe, expect, it } from "vitest";
import { EM_DASH, fmt, fmtAge, fmtBytes, fmtHours, fmtInterval, fmtSigned } from "./format";
import { timeTicks } from "./ticks";

describe("format", () => {
	it("prints a dash for a missing reading", () => {
		expect(fmt(null, "%")).toBe(EM_DASH);
		expect(fmtSigned(null, " mA")).toBe(EM_DASH);
	});

	it("signs positive values but never a rounded zero", () => {
		expect(fmtSigned(920, " mA")).toBe("+920 mA");
		expect(fmtSigned(-5.25, " %/h", 1)).toBe("-5.3 %/h");
		expect(fmtSigned(0.04, " %/h", 1)).toBe("0.0 %/h");
	});

	it("formats durations", () => {
		expect(fmtHours(3.2)).toBe("3h 12m");
		expect(fmtHours(0.75)).toBe("45m");
		expect(fmtInterval(15)).toBe("15s");
		expect(fmtInterval(120)).toBe("2m");
		expect(fmtInterval(90)).toBe("90s");
		expect(fmtInterval(3600)).toBe("1h");
	});

	it("formats ages and sizes", () => {
		expect(fmtAge(2)).toBe("just now");
		expect(fmtAge(42)).toBe("42s ago");
		expect(fmtAge(125)).toBe("2m ago");
		expect(fmtAge(7300)).toBe("2h ago");
		expect(fmtAge(200_000)).toBe("2d ago");
		expect(fmtBytes(512)).toBe("512 B");
		expect(fmtBytes(5_180_217)).toBe("4.9 MB");
	});
});

describe("timeTicks", () => {
	const HOUR = 3600;
	const DAY = 86400;
	const UTC3 = 3 * HOUR;
	const localHour = (t: number, offset: number) => (((t + offset) % DAY) + DAY) % DAY / HOUR;

	it("puts hourly ticks on the hour", () => {
		expect(timeTicks(100, 4 * HOUR, 4, 0)).toEqual([HOUR, 2 * HOUR, 3 * HOUR, 4 * HOUR]);
	});

	it("aligns day ticks to local midnight, not UTC midnight", () => {
		const ticks = timeTicks(1_700_000_000, 1_700_000_000 + 3 * DAY, 4, UTC3);
		expect(ticks).toHaveLength(3);
		expect(ticks.map((t) => localHour(t, UTC3))).toEqual([0, 0, 0]);
	});

	it("aligns half-day ticks to local noon and midnight", () => {
		const ticks = timeTicks(1_700_000_000, 1_700_000_000 + 2 * DAY, 4, UTC3);
		expect(ticks.map((t) => localHour(t, UTC3) % 12)).toEqual([0, 0, 0, 0]);
	});

	it("keeps a year of history to a handful of ticks", () => {
		const ticks = timeTicks(1_700_000_000, 1_700_000_000 + 365 * DAY, 4, 0);
		expect(ticks.length).toBeGreaterThan(1);
		expect(ticks.length).toBeLessThanOrEqual(5);
	});
});

import { fmtClock, fmtDay } from "./format";

const MIN = 60;
const HOUR = 3600;
const DAY = 86400;
const STEPS = [
	5 * MIN, 15 * MIN, 30 * MIN, HOUR, 2 * HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR,
	DAY, 2 * DAY, 7 * DAY, 14 * DAY, 30 * DAY, 90 * DAY, 180 * DAY, 365 * DAY,
];

function utcOffset(epochSeconds: number): number {
	return -new Date(epochSeconds * 1000).getTimezoneOffset() * 60;
}

// Round tick positions on local wall-clock boundaries, about `target` of them.
export function timeTicks(min: number, max: number, target = 4, offset = utcOffset(max)): number[] {
	const span = Math.max(1, max - min);
	const step = STEPS.find((s) => span / s <= target) ?? STEPS.at(-1)!;
	const ticks: number[] = [];
	for (let t = Math.ceil((min + offset) / step) * step - offset; t <= max; t += step) {
		ticks.push(t);
	}
	return ticks;
}

// A date at local midnight once the axis spans more than a day, else HH:MM.
export function tickLabel(t: number, span: number): string {
	const d = new Date(t * 1000);
	const midnight = d.getHours() === 0 && d.getMinutes() === 0;
	return span > DAY && midnight ? fmtDay(t) : fmtClock(t);
}

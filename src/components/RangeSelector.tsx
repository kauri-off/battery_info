import type { RangeHours } from "../lib/types";

const RANGES: { value: RangeHours; label: string }[] = [
	{ value: 1, label: "1h" },
	{ value: 6, label: "6h" },
	{ value: 24, label: "24h" },
	{ value: 168, label: "7d" },
	{ value: 0, label: "All" },
];

type Props = {
	value: RangeHours;
	onChange: (value: RangeHours) => void;
	/** Samples in the window; null while it is being read. */
	sampleCount: number | null;
};

export function RangeSelector({ value, onChange, sampleCount }: Props) {
	return (
		<div className="flex items-center gap-3">
			<div
				role="group"
				aria-label="Time range"
				className="inline-flex overflow-hidden rounded-lg border border-hairline bg-surface"
			>
				{RANGES.map((r) => (
					<button
						key={r.label}
						type="button"
						aria-pressed={value === r.value}
						onClick={() => onChange(r.value)}
						className={[
							"min-w-11 px-3 py-2 text-sm font-medium transition-colors",
							"border-r border-hairline last:border-r-0",
							value === r.value ? "bg-series-level text-white" : "text-ink-2 hover:bg-raised",
						].join(" ")}
					>
						{r.label}
					</button>
				))}
			</div>
			{sampleCount !== null && (
				<span className="ml-auto text-[13px] text-muted tabular-nums">
					{sampleCount.toLocaleString()} samples
				</span>
			)}
		</div>
	);
}

// StatTile.tsx — label + value figure. `hero` is the one oversized number on
// the page (battery level); everything else is a regular tile.

import type { ReactNode } from "react";

type Props = {
	label: string;
	value: string;
	/** Secondary line under the value. Adds a line — hero tiles only. */
	note?: string | undefined;
	/** Qualifier beside the label, e.g. the health string. Costs no height, so
	    tiles carrying one stay level with their row neighbour. */
	hint?: string | undefined;
	hero?: boolean;
	span?: 2;
	children?: ReactNode;
};

export function StatTile({ label, value, note, hint, hero, span, children }: Props) {
	return (
		<div
			className={[
				"flex min-w-0 flex-col gap-1 rounded-xl border border-hairline bg-surface p-3",
				span === 2 ? "col-span-2" : "",
			].join(" ")}
		>
			<span className="flex items-baseline justify-between gap-2 text-[11px] font-medium text-muted">
				<span className="truncate uppercase tracking-wide">{label}</span>
				{hint && <span className="shrink-0 text-ink-2">{hint}</span>}
			</span>
			{/* Large standalone figures use proportional digits; tabular-nums is
			    for columns that must align. */}
			<span
				className={[
					"truncate font-semibold text-ink",
					hero ? "text-5xl leading-none" : "text-lg",
				].join(" ")}
			>
				{value}
			</span>
			{note && <span className="truncate text-xs text-ink-2">{note}</span>}
			{children}
		</div>
	);
}

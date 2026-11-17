type Props = {
	label: string;
	value: string;
	/** Secondary line under the value. */
	note?: string | undefined;
	/** Qualifier beside the label; costs no height. */
	hint?: string | undefined;
	/** The one oversized figure on the page. */
	hero?: boolean;
	span?: 2;
};

export function StatTile({ label, value, note, hint, hero, span }: Props) {
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
			<span
				className={[
					"truncate font-semibold text-ink",
					hero ? "text-5xl leading-none" : "text-lg",
				].join(" ")}
			>
				{value}
			</span>
			{note && <span className="truncate text-xs text-ink-2">{note}</span>}
		</div>
	);
}

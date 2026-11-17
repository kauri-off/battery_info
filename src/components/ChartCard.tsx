import type { ReactNode } from "react";

type Props = {
	title: string;
	reading: string;
	children: ReactNode;
};

export function ChartCard({ title, reading, children }: Props) {
	return (
		<section className="rounded-xl border border-hairline bg-surface p-3">
			<header className="mb-2 flex items-baseline justify-between gap-3">
				<h2 className="text-[13px] font-semibold text-ink-2">{title}</h2>
				<span className="text-[13px] text-muted tabular-nums">{reading}</span>
			</header>
			{children}
		</section>
	);
}

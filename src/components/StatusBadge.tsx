// StatusBadge.tsx — charge state in the header. A status color never carries
// the meaning alone: the badge always spells the state out beside the dot.

type Props = {
	status: string;
	pct: number | null;
};

type Tone = { dot: string; text: string };

const NEUTRAL: Tone = { dot: "bg-muted", text: "text-ink-2" };
const GOOD: Tone = { dot: "bg-good", text: "text-ink" };
const CRITICAL: Tone = { dot: "bg-critical", text: "text-ink" };

function tone(status: string, pct: number | null): Tone {
	if (status === "Charging" || status === "Full") return GOOD;
	if (pct !== null && pct <= 15) return CRITICAL;
	return NEUTRAL;
}

export function StatusBadge({ status, pct }: Props) {
	const t = tone(status, pct);
	return (
		<span className="inline-flex items-center gap-2 rounded-full border border-hairline bg-surface px-3 py-1">
			<span className={`h-2 w-2 shrink-0 rounded-full ${t.dot}`} aria-hidden />
			<span className={`text-xs font-medium ${t.text}`}>{status}</span>
		</span>
	);
}

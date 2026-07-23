// ErrorBanner.tsx — surfaces a failed root-shell call without tearing the
// dashboard down; the last good data stays on screen behind it.

type Props = {
	message: string;
	onDismiss: () => void;
};

export function ErrorBanner({ message, onDismiss }: Props) {
	return (
		<div
			role="alert"
			className="flex items-start gap-3 rounded-xl border border-critical/40 bg-critical/10 p-3"
		>
			<span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-critical" aria-hidden />
			<p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[13px] text-ink">
				{message}
			</p>
			<button
				type="button"
				onClick={onDismiss}
				className="shrink-0 rounded-md px-2 py-0.5 text-xs text-ink-2 hover:bg-raised"
			>
				Dismiss
			</button>
		</div>
	);
}

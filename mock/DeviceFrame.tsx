// DeviceFrame.tsx — dev-only. The WebUI ships into a phone WebView, so the
// desktop preview renders it at phone size instead of full browser width.
// Dynamically imported behind import.meta.env.DEV; never in the module zip.

import type { ReactNode } from "react";

/** Pixel-ish logical viewport. */
const WIDTH = 412;
const HEIGHT = 883;

export function DeviceFrame({ children }: { children: ReactNode }) {
	return (
		<div className="flex min-h-dvh items-center justify-center bg-neutral-800 p-6">
			<div className="flex flex-col items-center gap-3">
				<div
					className="overflow-hidden rounded-[2.5rem] border-[10px] border-neutral-950 bg-plane shadow-2xl"
					style={{ width: WIDTH, height: HEIGHT }}
				>
					{/* Its own scroll context, so the page scrolls like it does on device. */}
					<div className="h-full overflow-y-auto">{children}</div>
				</div>
				<p className="text-xs text-neutral-400">
					dev preview · {WIDTH}×{HEIGHT} · mock root shell
				</p>
			</div>
		</div>
	);
}

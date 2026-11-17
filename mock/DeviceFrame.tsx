import type { ReactNode } from "react";

// Dev only: renders the WebUI at phone size.
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

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

// In dev there is no root shell, so a fake bridge stands in and the app is
// framed at phone size. Both imports are dynamic and behind import.meta.env.DEV
// so the production bundle drops them entirely.
async function boot() {
	let tree = <App />;

	if (import.meta.env.DEV) {
		await import("../mock/ksu-mock"); // must install window.ksu before the first exec
		const { DeviceFrame } = await import("../mock/DeviceFrame");
		tree = <DeviceFrame>{tree}</DeviceFrame>;
	}

	createRoot(document.getElementById("root")!).render(<StrictMode>{tree}</StrictMode>);
}

void boot();

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

// Dev only: a fake bridge and a phone frame, dropped from the production bundle.
async function boot() {
	let tree = <App />;

	if (import.meta.env.DEV) {
		await import("../mock/ksu-mock");
		const { DeviceFrame } = await import("../mock/DeviceFrame");
		tree = <DeviceFrame>{tree}</DeviceFrame>;
	}

	createRoot(document.getElementById("root")!).render(<StrictMode>{tree}</StrictMode>);
}

void boot();

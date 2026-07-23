import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// The WebUI is served by the KSU Next manager straight off the filesystem, so
// the build collapses to ONE self-contained module/webroot/index.html — no
// asset paths to resolve, nothing to cache-bust.
export default defineConfig({
	plugins: [react(), tailwindcss(), viteSingleFile()],
	build: {
		outDir: "module/webroot",
		emptyOutDir: true,
		target: "es2022",
		assetsInlineLimit: 100_000_000,
	},
	test: {
		environment: "node",
		include: ["src/**/*.test.ts"],
	},
});

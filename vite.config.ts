import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// One self-contained module/webroot/index.html: the WebView resolves no asset paths.
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
		testTimeout: 20_000,
		include: ["src/**/*.test.ts", "test/**/*.test.ts"],
	},
});

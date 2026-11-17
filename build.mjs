// Bundles the WebUI, draws the icons, refreshes update.json and zips the module.

import { build } from "vite";
import { ZipArchive } from "archiver";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import zlib from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MODULE = path.join(ROOT, "module");
const WEBROOT = path.join(MODULE, "webroot");
const DIST = path.join(ROOT, "dist");
const DOCS = path.join(ROOT, "docs");

// Every generated URL follows these two.
const GH_OWNER = "kauri-off";
const GH_REPO = "battery_info";

async function bundleWebUI() {
	await build({ root: ROOT, logLevel: "info" });
}

// Encodes an RGBA pixel buffer as a PNG.
function encodePNG(width, height, rgba) {
	const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
	const chunk = (type, data) => {
		const len = Buffer.alloc(4);
		len.writeUInt32BE(data.length, 0);
		const typeBuf = Buffer.from(type, "ascii");
		const body = Buffer.concat([typeBuf, data]);
		const crc = Buffer.alloc(4);
		crc.writeUInt32BE(crc32(body) >>> 0, 0);
		return Buffer.concat([len, body, crc]);
	};
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr.writeUInt8(8, 8); // bit depth
	ihdr.writeUInt8(6, 9); // color type RGBA
	const stride = width * 4;
	const raw = Buffer.alloc((stride + 1) * height);
	for (let y = 0; y < height; y++) {
		rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
	}
	const idat = zlib.deflateSync(raw, { level: 9 });
	return Buffer.concat([
		sig,
		chunk("IHDR", ihdr),
		chunk("IDAT", idat),
		chunk("IEND", Buffer.alloc(0)),
	]);
}

const CRC_TABLE = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();
function crc32(buf) {
	let c = 0xffffffff;
	for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
	return c ^ 0xffffffff;
}

// A battery glyph on a transparent 96x96 canvas.
function batteryIcon(fillColor) {
	const S = 96;
	const buf = Buffer.alloc(S * S * 4);
	const set = (x, y, [r, g, b, a]) => {
		if (x < 0 || y < 0 || x >= S || y >= S) return;
		const i = (y * S + x) * 4;
		buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
	};
	const rect = (x0, y0, x1, y1, color) => {
		for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) set(x, y, color);
	};
	const border = [230, 233, 238, 255];
	rect(40, 14, 56, 22, border);
	rect(26, 22, 70, 82, border);
	rect(30, 26, 66, 78, [0, 0, 0, 0]);
	const top = 26 + Math.round((78 - 26) * 0.3);
	rect(30, top, 66, 78, fillColor);
	return encodePNG(S, S, buf);
}

async function writeIcons() {
	await fs.writeFile(path.join(MODULE, "icon.png"), batteryIcon([79, 157, 255, 255]));
	await fs.writeFile(path.join(MODULE, "action.png"), batteryIcon([53, 196, 138, 255]));
}

// module.prop is the single source of truth for the version.
async function readModuleProp() {
	const text = await fs.readFile(path.join(MODULE, "module.prop"), "utf8");
	return Object.fromEntries(
		text
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line && !line.startsWith("#"))
			.map((line) => {
				const i = line.indexOf("=");
				return [line.slice(0, i), line.slice(i + 1)];
			}),
	);
}

// docs/update.json is what module.prop's updateJson points at.
async function writeUpdateJson() {
	const prop = await readModuleProp();
	const pkg = JSON.parse(await fs.readFile(path.join(ROOT, "package.json"), "utf8"));
	if (prop.version !== `v${pkg.version}`) {
		throw new Error(`module.prop is ${prop.version} but package.json is ${pkg.version}`);
	}
	const tag = prop.version;
	const manifest = {
		version: prop.version,
		versionCode: Number(prop.versionCode),
		zipUrl: `https://github.com/${GH_OWNER}/${GH_REPO}/releases/download/${tag}/battery_info.zip`,
		changelog: `https://${GH_OWNER}.github.io/${GH_REPO}/CHANGELOG.md`,
	};
	await fs.mkdir(DOCS, { recursive: true });
	await fs.writeFile(
		path.join(DOCS, "update.json"),
		`${JSON.stringify(manifest, null, 2)}\n`,
	);

	// The landing page's version badge follows module.prop too.
	const page = path.join(DOCS, "index.html");
	const html = await fs.readFile(page, "utf8");
	const stamped = html.replace(
		/(<span id="version">)[^<]*(<\/span>)/,
		`$1${prop.version}$2`,
	);
	if (stamped === html && !html.includes(`<span id="version">${prop.version}<`)) {
		throw new Error('docs/index.html: no <span id="version"> to stamp');
	}
	await fs.writeFile(page, stamped);

	return manifest;
}

function zipModule() {
	return new Promise((resolve, reject) => {
		const out = createWriteStream(path.join(DIST, "battery_info.zip"));
		const archive = new ZipArchive({ zlib: { level: 9 } });
		out.on("close", () => resolve(archive.pointer()));
		archive.on("error", reject);
		archive.pipe(out);
		// The contents of module/, so module.prop sits at the zip root.
		archive.directory(MODULE, false);
		archive.finalize();
	});
}

async function main() {
	await bundleWebUI();
	await writeIcons();
	const manifest = await writeUpdateJson();
	await fs.mkdir(DIST, { recursive: true });
	const bytes = await zipModule();
	console.log(
		`\nBuilt module/webroot and dist/battery_info.zip (${bytes} bytes).` +
			`\nupdate.json -> ${manifest.version} (versionCode ${manifest.versionCode}).`,
	);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});

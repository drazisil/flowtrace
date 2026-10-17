// Runs in the module-loader thread. Rewrites JavaScript modules as they are loaded.
// Nothing on disk changes.

import { appendFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { transform } from "./transform.mjs";

let config = { root: process.cwd(), include: [], selfDir: "", inventory: "" };

export async function initialize(data) {
	config = data;
}

function shouldTrace(file) {
	// the tool's own files, not the examples folder beneath it
	if (dirname(file) === config.selfDir) return false;
	if (file.includes("/node_modules/")) return false;
	if (config.include.length > 0) return config.include.some((part) => file.includes(part));
	return file.startsWith(config.root);
}

export async function load(url, context, nextLoad) {
	const result = await nextLoad(url, context);

	if (!url.startsWith("file:") || result.source == null) return result;
	if (result.format !== "module") return result;

	const file = fileURLToPath(url);
	if (!shouldTrace(file)) return result;

	const source =
		typeof result.source === "string" ? result.source : Buffer.from(result.source).toString("utf8");

	try {
		const { code, wrapped, functions } = transform(source, file, config);
		if (functions.length > 0) {
			appendFileSync(config.inventory, `${functions.map((f) => JSON.stringify(f)).join("\n")}\n`);
		}
		process.stderr.write(`[flowtrace] ${wrapped} functions  ${file}\n`);
		return { ...result, source: code };
	} catch (error) {
		// Loud, not silent: the module runs untraced, but you are told.
		process.stderr.write(`[flowtrace] SKIPPED ${file}: ${error.message}\n`);
		return result;
	}
}

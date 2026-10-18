// The part of the load hook that rewrites a module's source. It has no hook plumbing of its own,
// so register.mjs can use it from a synchronous hook (module.registerHooks, in the main thread) or
// hooks.mjs can use it from an asynchronous one (module.register, in the loader thread).

import { appendFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { transform } from "./transform.mjs";

function shouldTrace(file, config) {
	// the tool's own files, not the examples folder beneath it
	if (dirname(file) === config.selfDir) return false;
	if (file.includes("/node_modules/")) return false;
	if (config.include.length > 0) return config.include.some((part) => file.includes(part));
	return file.startsWith(config.root);
}

// `result` is what the next loader returned for `url`; returns it, with the source rewritten
// when it is a JavaScript module this run should trace.
export function rewrite(url, result, config) {
	if (!url.startsWith("file:") || result.source == null) return result;
	if (result.format !== "module") return result;

	const file = fileURLToPath(url);
	if (!shouldTrace(file, config)) return result;

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

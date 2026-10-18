// Usage:  node --import /path/to/flowtrace/register.mjs app.mjs
//   TypeScript via tsx:  node --import tsx --import /path/to/flowtrace/register.mjs app.ts
//   (tsx first, so this loader runs on tsx's JavaScript output)
//
// Environment:
//   FLOWTRACE_OUT      log file (default ./flowtrace.log). Every function in the log is
//                      written as name#id; <log>.functions.jsonl maps each id to its
//                      name and file, so same-named functions in different files stay apart
//   FLOWTRACE_ROOT     only trace files under this directory (default: cwd)
//   FLOWTRACE_INCLUDE  comma-separated path fragments to trace instead of ROOT
//   FLOWTRACE_ROOTS    comma-separated function names; only log call trees that start there

import "./runtime.mjs";
import { writeFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rewrite } from "./rewrite.mjs";

const inventory = `${resolve(process.env.FLOWTRACE_OUT ?? "flowtrace.log")}.functions.jsonl`;
writeFileSync(inventory, "");

const config = {
	root: process.env.FLOWTRACE_ROOT ?? process.cwd(),
	include: (process.env.FLOWTRACE_INCLUDE ?? "").split(",").filter(Boolean),
	selfDir: dirname(fileURLToPath(import.meta.url)),
	inventory,
};

if (typeof nodeModule.registerHooks === "function") {
	// A synchronous hook registered here runs outside the ones registered before it. That is what
	// lets it see tsx's JavaScript: tsx 4.2x on Node 22.15+ registers this way too, and an
	// asynchronous module.register() hook would run beneath it and see raw TypeScript.
	nodeModule.registerHooks({
		load(url, context, nextLoad) {
			return rewrite(url, nextLoad(url, context), config);
		},
	});
} else {
	nodeModule.register("./hooks.mjs", import.meta.url, { data: config });
}

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
import { register } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const inventory = `${resolve(process.env.FLOWTRACE_OUT ?? "flowtrace.log")}.functions.jsonl`;
writeFileSync(inventory, "");

register("./hooks.mjs", import.meta.url, {
	data: {
		root: process.env.FLOWTRACE_ROOT ?? process.cwd(),
		include: (process.env.FLOWTRACE_INCLUDE ?? "").split(",").filter(Boolean),
		selfDir: dirname(fileURLToPath(import.meta.url)),
		inventory,
	},
});

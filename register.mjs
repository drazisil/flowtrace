// Usage:  node --import /data/Code/flowtrace/register.mjs app.mjs
//   TypeScript via tsx:  node --import tsx --import /data/Code/flowtrace/register.mjs app.ts
//   (tsx first, so this loader runs on tsx's JavaScript output)
//
// Environment:
//   FLOWTRACE_OUT      log file (default ./flowtrace.log)
//   FLOWTRACE_ROOT     only trace files under this directory (default: cwd)
//   FLOWTRACE_INCLUDE  comma-separated path fragments to trace instead of ROOT
//   FLOWTRACE_ARGS=0   do not log arguments
//   FLOWTRACE_ROOTS    comma-separated function names; only log call trees that start there

import "./runtime.mjs";
import { register } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

register("./hooks.mjs", import.meta.url, {
	data: {
		root: process.env.FLOWTRACE_ROOT ?? process.cwd(),
		include: (process.env.FLOWTRACE_INCLUDE ?? "").split(",").filter(Boolean),
		args: process.env.FLOWTRACE_ARGS !== "0",
		selfDir: dirname(fileURLToPath(import.meta.url)),
	},
});

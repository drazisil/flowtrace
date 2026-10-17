// Runs in the main thread. Installs globalThis.__flowtrace, which the rewritten code calls.
//
// Each call is logged on entry and exit. AsyncLocalStorage carries a trace id and depth, so
// one request's calls stay together, and indented, across await and callback hops. A call made
// with no trace active starts a new trace (a socket event, a timer, the main module).

import { AsyncLocalStorage } from "node:async_hooks";
import { openSync, writeSync } from "node:fs";

const store = new AsyncLocalStorage();
const outPath = process.env.FLOWTRACE_OUT ?? "flowtrace.log";
const fd = openSync(outPath, "w");
const t0 = performance.now();
let traceCount = 0;

// FLOWTRACE_ROOTS=name1,name2 : only log call trees that start at a function whose name
// contains one of these. Without it, every top-level call starts a trace.
const roots = (process.env.FLOWTRACE_ROOTS ?? "").split(",").filter(Boolean);

function summarize(value) {
	try {
		switch (typeof value) {
			case "string":
				return JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}…` : value);
			case "number":
			case "boolean":
			case "undefined":
			case "bigint":
				return String(value);
			case "function":
				return "fn";
			case "symbol":
				return value.toString();
		}
		if (value === null) return "null";
		if (Buffer.isBuffer(value)) {
			const head = value.subarray(0, 16).toString("hex");
			return `Buffer(${value.length}:${head}${value.length > 16 ? "…" : ""})`;
		}
		if (Array.isArray(value)) return `Array(${value.length})`;
		const name = value.constructor?.name ?? "Object";
		const keys = Object.keys(value);
		const shown = keys.slice(0, 4).join(",");
		return `${name}{${shown}${keys.length > 4 ? ",…" : ""}}`;
	} catch (error) {
		return `<unprintable: ${error.message}>`;
	}
}

function formatArgs(args) {
	if (!args) return "";
	return Array.from(args, summarize).join(", ");
}

function write(trace, depth, text) {
	const elapsed = (performance.now() - t0).toFixed(1).padStart(9);
	writeSync(fd, `${elapsed}ms t${trace} ${"  ".repeat(depth)}${text}\n`);
}

function describe(meta) {
	const [name, where] = meta.split("|");
	return { name, where };
}

globalThis.__flowtrace = {
	call(meta, args, fn) {
		const parent = store.getStore();
		if (!parent && roots.length > 0) {
			const name = meta.slice(0, meta.indexOf("|"));
			if (!roots.some((root) => name.includes(root))) return fn();
		}
		const frame = parent
			? { trace: parent.trace, depth: parent.depth + 1 }
			: { trace: ++traceCount, depth: 0 };
		const { name, where } = describe(meta);
		const start = performance.now();

		write(frame.trace, frame.depth, `→ ${name}(${formatArgs(args)})  ${where}`);

		const finish = (verb, detail = "") => {
			const took = (performance.now() - start).toFixed(2);
			write(frame.trace, frame.depth, `${verb} ${name} ${took}ms${detail}`);
		};

		return store.run(frame, () => {
			let result;
			try {
				result = fn();
			} catch (error) {
				finish("✗", `  ${error?.message ?? error}`);
				throw error;
			}
			if (result && typeof result.then === "function") {
				return result.then(
					(value) => {
						finish("←");
						return value;
					},
					(error) => {
						finish("✗", `  ${error?.message ?? error}`);
						throw error;
					},
				);
			}
			finish("←");
			return result;
		});
	},
};

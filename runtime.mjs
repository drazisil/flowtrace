// Runs in the main thread. Installs globalThis.__flowtrace, which the rewritten code calls.
//
// Writes a timeline tree, one line per call:
//
//   09:07:12.140 t1 renderFormPage
//   09:07:12.141 t1   Form.load
//   09:07:12.310 t2 isValidWord
//   09:07:19.030 t52   ✗ Session not found
//
// Only names, structure and time are recorded: no arguments, no return values, no line numbers.
// AsyncLocalStorage carries a trace id and depth, so one request's calls stay together, and
// indented, across await and callback hops. A call made with no trace active starts a new
// trace (a socket event, a timer, the main module).

import { AsyncLocalStorage } from "node:async_hooks";
import { openSync, writeSync } from "node:fs";

const store = new AsyncLocalStorage();
const outPath = process.env.FLOWTRACE_OUT ?? "flowtrace.log";
const fd = openSync(outPath, "w");
let traceCount = 0;

// FLOWTRACE_ROOTS=name1,name2 : only log call trees that start at a function whose name
// contains one of these. Without it, every top-level call starts a trace.
const roots = (process.env.FLOWTRACE_ROOTS ?? "").split(",").filter(Boolean);

// A thrown error passes through every caller above it. Log it once, where it started.
const loggedErrors = new WeakSet();

function pad(value, width) {
	return String(value).padStart(width, "0");
}

function clock() {
	const now = new Date();
	return `${pad(now.getHours(), 2)}:${pad(now.getMinutes(), 2)}:${pad(now.getSeconds(), 2)}.${pad(now.getMilliseconds(), 3)}`;
}

function write(frame, text) {
	writeSync(fd, `${clock()} t${frame.trace} ${"  ".repeat(frame.depth)}${text}\n`);
}

function logFailure(frame, error) {
	if (typeof error === "object" && error !== null) {
		if (loggedErrors.has(error)) return;
		loggedErrors.add(error);
	}
	write({ trace: frame.trace, depth: frame.depth + 1 }, `✗ ${error?.message ?? error}`);
}

globalThis.__flowtrace = {
	call(name, fn) {
		const parent = store.getStore();
		if (!parent && roots.length > 0 && !roots.some((root) => name.includes(root))) {
			return fn();
		}

		const frame = parent
			? { trace: parent.trace, depth: parent.depth + 1 }
			: { trace: ++traceCount, depth: 0 };

		write(frame, name);

		return store.run(frame, () => {
			let result;
			try {
				result = fn();
			} catch (error) {
				logFailure(frame, error);
				throw error;
			}
			if (result && typeof result.then === "function") {
				return result.then(undefined, (error) => {
					logFailure(frame, error);
					throw error;
				});
			}
			return result;
		});
	},
};

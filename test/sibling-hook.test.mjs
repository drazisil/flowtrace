import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as nodeModule from "node:module";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const register = join(dirname(fileURLToPath(import.meta.url)), "..", "register.mjs");

// tsx 4.2x on Node 22.15+ turns TypeScript into JavaScript in a synchronous module.registerHooks
// hook. This stands in for it: a preload that registers such a hook for ".xts" files and strips
// the one type annotation they use. flowtrace, loaded after it, has to see the stripped source.
const preload = `
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
registerHooks({
	load(url, context, nextLoad) {
		if (!url.endsWith(".xts")) return nextLoad(url, context);
		const source = readFileSync(fileURLToPath(url), "utf8").replace(": number", "");
		return { format: "module", source, shortCircuit: true };
	},
});
`;

test(
	"flowtrace sees the JavaScript a synchronous hook loaded before it produced",
	{ skip: typeof nodeModule.registerHooks !== "function" && "needs module.registerHooks" },
	() => {
		const dir = mkdtempSync(join(tmpdir(), "flowtrace-sibling-"));
		const log = join(dir, "run.log");
		writeFileSync(join(dir, "preload.mjs"), preload);
		writeFileSync(
			join(dir, "mod.xts"),
			"function go(n: number) { return n + 1; }\nconsole.log(go(1));\n",
		);
		const result = spawnSync(
			process.execPath,
			["--import", "./preload.mjs", "--import", register, "mod.xts"],
			{ cwd: dir, env: { ...process.env, FLOWTRACE_OUT: log }, encoding: "utf8" },
		);
		assert.equal(result.status, 0, result.stderr);
		assert.equal(result.stdout.trim(), "2");
		assert.doesNotMatch(result.stderr, /SKIPPED/);
		const lines = readFileSync(log, "utf8").split("\n").filter(Boolean);
		assert.equal(lines.length, 1);
		assert.match(lines[0], / go#[0-9a-f]+$/);
	},
);

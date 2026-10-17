import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const examples = join(root, "examples");

function runDemo() {
	const dir = mkdtempSync(join(tmpdir(), "flowtrace-"));
	const log = join(dir, "run.log");
	const result = spawnSync(
		process.execPath,
		["--import", join(root, "register.mjs"), "demo.mjs"],
		{ cwd: examples, env: { ...process.env, FLOWTRACE_OUT: log }, encoding: "utf8" },
	);
	assert.equal(result.status, 0, result.stderr);

	const entries = readFileSync(log, "utf8")
		.split("\n")
		.filter((line) => line && !line.includes("✗"))
		.map((line) => line.replace(/^\S+ t\d+ +/, ""));
	const inventory = readFileSync(`${log}.functions.jsonl`, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line));
	return { entries, inventory };
}

test("every call in the log carries an id that the inventory explains", () => {
	const { entries, inventory } = runDemo();
	const byId = new Map(inventory.map((fn) => [fn.id, fn]));
	assert.ok(entries.length > 0);

	for (const entry of entries) {
		const match = entry.match(/^(.+)#([0-9a-f]{6,})$/);
		assert.ok(match, `log line has no id: ${entry}`);
		const fn = byId.get(match[2]);
		assert.ok(fn, `id ${match[2]} is not in the inventory`);
		assert.equal(fn.name, match[1]);
	}
});

test("same-named functions in different files get different ids", () => {
	const { entries, inventory } = runDemo();
	const registers = inventory.filter((fn) => fn.name === "register");

	assert.equal(registers.length, 2);
	assert.notEqual(registers[0].id, registers[1].id);
	assert.notEqual(registers[0].file, registers[1].file);
	for (const fn of registers) {
		assert.ok(entries.includes(`register#${fn.id}`), `register#${fn.id} never ran`);
	}
});

test("ids are the same on every run", () => {
	const first = runDemo().inventory.map((fn) => `${fn.id} ${fn.name} ${fn.file}`).sort();
	const second = runDemo().inventory.map((fn) => `${fn.id} ${fn.name} ${fn.file}`).sort();
	assert.deepEqual(first, second);
});

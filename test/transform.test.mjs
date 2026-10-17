import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const register = join(dirname(fileURLToPath(import.meta.url)), "..", "register.mjs");

// Run `source` as an ES module under flowtrace; return what it printed and the log lines
// with the clock, trace tag and #id stripped (indentation kept).
function run(source, env = {}) {
	const dir = mkdtempSync(join(tmpdir(), "flowtrace-t-"));
	const log = join(dir, "run.log");
	writeFileSync(join(dir, "mod.mjs"), source);
	const result = spawnSync(process.execPath, ["--import", register, "mod.mjs"], {
		cwd: dir,
		env: { ...process.env, FLOWTRACE_OUT: log, ...env },
		encoding: "utf8",
	});
	assert.equal(result.status, 0, result.stderr);
	const lines = readFileSync(log, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((line) => line.replace(/^\S+ t\d+ /, "").replace(/#[0-9a-f]{6,}/, ""));
	return { out: result.stdout.trim(), lines };
}

test("a derived constructor can still call super()", () => {
	const { out, lines } = run(`
		class A { constructor(n) { this.n = n; } }
		class B extends A { constructor(n) { super(n + 1); this.m = n; } }
		const b = new B(1);
		console.log(JSON.stringify([b.n, b.m]));
	`);
	assert.equal(out, "[2,1]");
	assert.deepEqual(lines, ["B.constructor", "  A.constructor"]);
});

test("this, arguments and return values pass through unchanged", () => {
	const { out } = run(`
		const o = { v: 5, f() { return [this.v, arguments.length, arguments[1]]; } };
		console.log(JSON.stringify(o.f(1, 2, 3)));
	`);
	assert.equal(out, "[5,3,2]");
});

test("async functions keep their order across await, and nest under their caller", () => {
	const { out, lines } = run(`
		async function inner() { await new Promise((r) => setTimeout(r, 1)); return 7; }
		async function outer() { const x = await inner(); return x + 1; }
		console.log(await outer());
	`);
	assert.equal(out, "8");
	assert.deepEqual(lines, ["outer", "  inner"]);
});

test("getters and setters are named with their class and kind", () => {
	const { lines } = run(`
		class C { get x() { return 1; } set x(v) {} }
		const c = new C();
		c.x;
		c.x = 2;
	`);
	assert.deepEqual(lines, ["C.get x", "C.set x"]);
});

test("a thrown error is logged once, where it started", () => {
	const { lines } = run(`
		function a() { b(); }
		function b() { c(); }
		function c() { throw new Error("boom"); }
		try { a(); } catch {}
	`);
	assert.deepEqual(lines, ["a", "  b", "    c", "      ✗ boom"]);
});

test("generators and expression-bodied arrows run normally and are not traced", () => {
	const { out, lines } = run(`
		function* gen() { yield 1; yield 2; }
		const double = (x) => x * 2;
		function main() { return [...gen()].map(double); }
		console.log(JSON.stringify(main()));
	`);
	assert.equal(out, "[2,4]");
	assert.deepEqual(lines, ["main"]);
});

test("FLOWTRACE_ROOTS logs only the trees that start at a matching function", () => {
	const { lines } = run(
		`
		function noise() { helper(); }
		function helper() {}
		function target() { inside(); }
		function inside() {}
		noise();
		target();
	`,
		{ FLOWTRACE_ROOTS: "target" },
	);
	assert.deepEqual(lines, ["target", "  inside"]);
});

test("the log never contains argument values", () => {
	const { lines } = run(`
		function login(user, password) { return user + password; }
		login("alice", "hunter2");
	`);
	assert.deepEqual(lines, ["login"]);
});

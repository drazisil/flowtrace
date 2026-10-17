// Rewrites every block-bodied function so its body runs inside __flowtrace.call(...).
//
//   function f(a) { BODY }   ->   function f(a) { return __flowtrace.call("f#3f9a2c", () => { BODY }); }
//
// The part after # is the function's id: a short hash of its file path and position, the same
// on every run until that code moves. Two functions that share a name get different ids, so
// a collision shows in the log. Ids are listed, with file and name, in the inventory file.
//
// The body moves into an arrow function, which keeps `this`, `arguments`, `new.target`
// and `super` working, and lets a derived constructor still call super(). Async functions
// get an async arrow, so the exit is logged when the returned promise settles.
//
// Not wrapped (on purpose): generators and async generators (the body cannot move into an
// arrow), and expression-bodied arrows (inline callbacks like `.map(x => x + 1)`, too noisy).

import { createHash } from "node:crypto";
import { relative } from "node:path";
import { parse } from "acorn";
import MagicString from "magic-string";

const FUNCTION_TYPES = new Set([
	"FunctionDeclaration",
	"FunctionExpression",
	"ArrowFunctionExpression",
]);

function propertyName(key, computed, source) {
	if (!computed && key.type === "Identifier") return key.name;
	if (key.type === "Literal") return String(key.value);
	if (key.type === "PrivateIdentifier") return `#${key.name}`;
	return `[${source.slice(key.start, key.end)}]`;
}

function functionName(node, parent, cls, source) {
	if (node.type === "FunctionDeclaration" && node.id) return node.id.name;
	if (parent) {
		if (parent.type === "MethodDefinition") {
			const name = propertyName(parent.key, parent.computed, source);
			const prefix = cls ? `${cls}.` : "";
			const kind = parent.kind === "get" || parent.kind === "set" ? `${parent.kind} ` : "";
			return `${prefix}${kind}${name}`;
		}
		if (parent.type === "PropertyDefinition") {
			return `${cls ? `${cls}.` : ""}${propertyName(parent.key, parent.computed, source)}`;
		}
		if (parent.type === "Property") return propertyName(parent.key, parent.computed, source);
		if (parent.type === "VariableDeclarator" && parent.id.type === "Identifier") {
			return parent.id.name;
		}
		if (parent.type === "AssignmentExpression") {
			return source.slice(parent.left.start, parent.left.end).slice(0, 60);
		}
	}
	return node.id?.name ?? "<anon>";
}

// id -> "file:offset" that owns it, so two functions can never share an id.
const claimed = new Map();

function functionId(file, start) {
	const key = `${file}:${start}`;
	const digest = createHash("sha1").update(key).digest("hex");
	for (let length = 6; length <= digest.length; length++) {
		const id = digest.slice(0, length);
		const owner = claimed.get(id);
		if (owner === undefined || owner === key) {
			claimed.set(id, key);
			return id;
		}
	}
	throw new Error(`no unique function id for ${key}`);
}

/**
 * @param {string} source module source (already JavaScript)
 * @param {string} file absolute path
 * @param {{ root: string }} options
 * @returns {{ code: string, wrapped: number, functions: { id: string, name: string, file: string }[] }}
 */
export function transform(source, file, { root }) {
	const ast = parse(source, {
		ecmaVersion: "latest",
		sourceType: "module",
		locations: true,
		allowHashBang: true,
	});
	const out = new MagicString(source);
	const label = relative(root, file) || file;
	const functions = [];
	let wrapped = 0;

	function wrap(node, parent, cls) {
		if (node.generator) return;
		if (node.body.type !== "BlockStatement") return;

		const name = functionName(node, parent, cls, source);
		const id = functionId(label, node.start);
		const asyncKw = node.async ? "async " : "";

		out.appendLeft(
			node.body.start + 1,
			`return globalThis.__flowtrace.call(${JSON.stringify(`${name}#${id}`)}, ${asyncKw}() => {`,
		);
		out.prependRight(node.body.end - 1, "});");
		functions.push({ id, name, file: label });
		wrapped++;
	}

	function walk(node, parent, cls) {
		if (!node || typeof node.type !== "string") return;

		let childCls = cls;
		if (node.type === "ClassDeclaration" || node.type === "ClassExpression") {
			childCls = node.id?.name ?? cls ?? "<class>";
		}

		if (FUNCTION_TYPES.has(node.type)) wrap(node, parent, cls);

		for (const key of Object.keys(node)) {
			if (key === "loc") continue;
			const value = node[key];
			if (Array.isArray(value)) {
				for (const child of value) walk(child, node, childCls);
			} else if (value && typeof value.type === "string") {
				walk(value, node, childCls);
			}
		}
	}

	walk(ast, null, null);
	return { code: out.toString(), wrapped, functions };
}

// Rewrites every block-bodied function so its body runs inside __flowtrace.call(...).
//
//   function f(a) { BODY }   ->   function f(a) { return __flowtrace.call("f|file:12", arguments, () => { BODY }); }
//
// The body moves into an arrow function, which keeps `this`, `arguments`, `new.target`
// and `super` working, and lets a derived constructor still call super(). Async functions
// get an async arrow, so the exit is logged when the returned promise settles.
//
// Not wrapped (on purpose): generators and async generators (the body cannot move into an
// arrow), and expression-bodied arrows (inline callbacks like `.map(x => x + 1)`, too noisy).

import { relative } from "node:path";
import { parse } from "acorn";
import MagicString from "magic-string";
import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping";

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

// tsx and similar tools leave an inline source map; use it so the log shows .ts lines.
function readInlineMap(source) {
	const match = source.match(
		/\/\/# sourceMappingURL=data:application\/json(?:;charset=utf-8)?;base64,([A-Za-z0-9+/=]+)/,
	);
	if (!match) return null;
	return new TraceMap(Buffer.from(match[1], "base64").toString("utf8"));
}

/**
 * @param {string} source module source (already JavaScript)
 * @param {string} file absolute path, used for the log label
 * @param {{ root: string, args: boolean }} options
 * @returns {{ code: string, wrapped: number }}
 */
export function transform(source, file, { root, args }) {
	const ast = parse(source, {
		ecmaVersion: "latest",
		sourceType: "module",
		locations: true,
		allowHashBang: true,
	});
	const out = new MagicString(source);
	const map = readInlineMap(source);
	const label = relative(root, file) || file;

	function sourceLine(node) {
		if (!map) return node.loc.start.line;
		const pos = originalPositionFor(map, {
			line: node.loc.start.line,
			column: node.loc.start.column,
		});
		return pos.line ?? node.loc.start.line;
	}
	let wrapped = 0;

	function wrap(node, parent, cls) {
		if (node.generator) return;
		if (node.body.type !== "BlockStatement") return;

		const name = functionName(node, parent, cls, source);
		const meta = JSON.stringify(`${name}|${label}:${sourceLine(node)}`);
		const argsExpr = args && node.type !== "ArrowFunctionExpression" ? "arguments" : "undefined";
		const asyncKw = node.async ? "async " : "";

		out.appendLeft(
			node.body.start + 1,
			`return globalThis.__flowtrace.call(${meta}, ${argsExpr}, ${asyncKw}() => {`,
		);
		out.prependRight(node.body.end - 1, "});");
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
	return { code: out.toString(), wrapped };
}

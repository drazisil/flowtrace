// Runs in the module-loader thread. Used on Node versions without module.registerHooks, where
// register.mjs falls back to module.register(). Nothing on disk changes.

import { rewrite } from "./rewrite.mjs";

let config = { root: process.cwd(), include: [], selfDir: "", inventory: "" };

export async function initialize(data) {
	config = data;
}

export async function load(url, context, nextLoad) {
	return rewrite(url, await nextLoad(url, context), config);
}

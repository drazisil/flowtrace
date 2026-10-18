# Changelog

## 0.1.1

- Fix: under tsx 4.2x on Node 22.15 or newer, every TypeScript file was skipped with
  `Unexpected token`. tsx now converts TypeScript in a synchronous `module.registerHooks` hook,
  which runs outside flowtrace's asynchronous `module.register()` hook, so flowtrace received raw
  TypeScript. flowtrace now registers with `module.registerHooks` when it exists, after tsx, and so
  sees tsx's JavaScript. Older Node versions still use `module.register()`.
- The source-rewriting step moved to `rewrite.mjs`, shared by both paths.

## 0.1.0

First public version.

- ES module loader hook that wraps every block-bodied function and writes a timeline tree.
- Log lines carry wall-clock time, a trace tag, indentation and `name#id`. Errors are logged once,
  where they started.
- Stable function ids (a hash of file path and position) and a `<log>.functions.jsonl` inventory,
  so same-named functions stay distinguishable.
- Records names, structure and time only: no arguments, return values or line numbers.
- Works under tsx (TypeScript). `FLOWTRACE_ROOTS` limits the log to call trees starting at chosen
  functions.

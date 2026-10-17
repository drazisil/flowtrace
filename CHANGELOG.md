# Changelog

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

# flowtrace

Run a Node program and get a log of how the code flowed: which function called which, in order,
as an indented timeline tree. You don't change your source. flowtrace wraps your functions as
they are loaded.

```
09:28:56.421 t7 receiveRoomData#4be1a0
09:28:56.421 t7   handleEncryptedCommand#c2907d
09:28:56.421 t7     handleOpenCommChannel#a41f5e
09:28:56.422 t7       createNpsReply#9c0712
09:28:56.430 t7     handleTrackingPing#77d0b3
09:28:56.431 t7       ✗ Session not found
```

It is built for the question "what does this code actually do at runtime?": following a request
through a dispatch table, finding the function that shouldn't be running, or noticing that the same
work happens fifty times where once would do. Reading the log is the whole feature. There are no
graphs, summaries or analysis; people and tools can read a plain text log.

## Quick start

```sh
git clone https://github.com/drazisil/flowtrace
cd flowtrace && npm install

# plain JavaScript (ES modules)
node --import /path/to/flowtrace/register.mjs your-app.mjs

# TypeScript through tsx: list tsx first, so flowtrace sees tsx's JavaScript output
node --import tsx --import /path/to/flowtrace/register.mjs your-app.ts
```

The log is written to `./flowtrace.log`. Node 20.6 or newer.
On Node 22.15 and newer flowtrace hooks in with `module.registerHooks`, so keep `--import tsx` before
`--import flowtrace`: the later hook runs outermost and sees tsx's output.

To use it from another project: `npm install --save-dev github:drazisil/flowtrace`, then
`node --import flowtrace/register your-app.mjs`.

## What the log contains

One line per call: `time  trace  indentation  name#id`.

- **time**: wall-clock `HH:MM:SS.mmm`, so you can line it up with your own logs.
- **trace** (`t7`): calls that belong together share a tag, across `await` and callbacks.
- **indentation**: call depth.
- **name**: `Class.method`, `Class.get prop`, or the function's name. `<anon>` if it has none.
- **id** (`#4be1a0`): a short hash of the file path and the function's position. It is the same on
  every run until that code moves. Two functions with the same name get different ids, so name
  collisions show up in the log instead of hiding.
- **`✗ message`**: a call threw. The error is logged once, where it started, not once per caller.

**What it never records:** arguments, return values, line numbers. Nothing in the log needs
sanitizing, because no values are in it.

Next to the log, `flowtrace.log.functions.jsonl` maps every id to its name and file:

```json
{"id":"4be1a0","name":"receiveRoomData","file":"src/receiveRoomData.ts"}
```

To find where a function in the log lives: `grep 4be1a0 flowtrace.log.functions.jsonl`.

## Options

Set with environment variables.

| Variable | Default | Meaning |
|---|---|---|
| `FLOWTRACE_OUT` | `./flowtrace.log` | Log file. The inventory is written to `<log>.functions.jsonl`. |
| `FLOWTRACE_ROOT` | current directory | Only trace files under this directory. `node_modules` is never traced. |
| `FLOWTRACE_INCLUDE` | | Comma-separated path fragments to trace instead of `FLOWTRACE_ROOT`. |
| `FLOWTRACE_ROOTS` | | Comma-separated function names. Only log call trees that start at a function whose name contains one of these. Useful to skip start-up noise. |

## How it works

An ES module loader hook (`module.register`) parses each module as it loads, using
[acorn](https://github.com/acornjs/acorn), and rewrites every function body to run inside a call to
the recorder:

```js
function f(a) { BODY }
// becomes
function f(a) { return globalThis.__flowtrace.call("f#3f9a2c", () => { BODY }); }
```

The body moves into an arrow function, which keeps `this`, `arguments`, `new.target` and `super`
working, so a derived constructor can still call `super()`. Async functions get an async arrow. The
recorder uses `AsyncLocalStorage` to carry the trace tag and depth through `await`s and callbacks.
Nothing on disk changes.

## Limits

This is an early version. Know what it does not do:

- **ES modules only.** CommonJS files are not traced and are skipped without a message.
- **Not traced:** generators and async generators (the body can't move into an arrow), and
  expression-bodied arrows like `.map(x => x + 1)` (too noisy). They run normally.
- **Trace tags follow where a listener was created.** In an event-driven server, a callback started
  from `main` shares its trace tag with every later event. The call chains are correct; the tag
  doesn't separate requests. `FLOWTRACE_ROOTS` limits what is logged but doesn't reset the tag.
- **It changes the running code,** though not your files. Expect slower start-up and slower calls,
  and don't trust timing-sensitive behavior while it's on. Stack traces from traced files point at
  the rewritten code, not your original lines.
- **Names, not types.** Two classes with the same name and method share a log name; the `#id` is
  what tells them apart.

## Development

```sh
npm install
npm test
```

The tests run small modules under the loader and check the log.

## License

[MIT](LICENSE)

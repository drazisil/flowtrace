// A second function named `register`, so the demo has two same-named functions in two files.
const seen = new Set();

export function register(key) {
	seen.add(key);
	return seen.size;
}

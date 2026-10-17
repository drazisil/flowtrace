// A small packet server shape: a registry dispatch, async hops, a class hierarchy.

class Base {
	constructor(name) {
		this.name = name;
	}
	describe() {
		return `base:${this.name}`;
	}
}

class Handler extends Base {
	constructor(name, opcode) {
		super(name);
		this.opcode = opcode;
	}
	async handle(packet) {
		const decoded = await decode(packet);
		return this.reply(decoded);
	}
	reply(decoded) {
		return { opcode: this.opcode, ok: decoded.length > 0 };
	}
}

const registry = new Map();

function register(handler) {
	registry.set(handler.opcode, handler);
}

async function decode(packet) {
	await new Promise((resolve) => setTimeout(resolve, 2));
	return Buffer.from(packet.map((b) => b ^ 0xff));
}

async function dispatch(connectionId, opcode, packet) {
	const handler = registry.get(opcode);
	if (!handler) throw new Error(`no handler for ${opcode}`);
	return handler.handle(packet);
}

register(new Handler("login", 0x501));
register(new Handler("repair", 0xb1));

await Promise.all([
	dispatch("conn-1", 0x501, [1, 2, 3]),
	dispatch("conn-2", 0xb1, [9, 9]),
]);

await dispatch("conn-3", 0x999, [0]).catch(() => {});

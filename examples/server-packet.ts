// Sends one MC_REPAIR_SINGLE_PART packet (opcode 177) through the real transactions
// module. Does not start the server. Run from /data/Code/server:
//   node --import tsx --import /data/Code/flowtrace/register.mjs /data/Code/flowtrace/examples/server-packet.ts
import { MessageNode } from "/data/Code/server/packages/shared/index.ts";
import { receiveTransactionsData } from "/data/Code/server/packages/transactions/src/internal.ts";

const message = new MessageNode();
const body = Buffer.alloc(10);
body.writeInt16LE(177, 0);
message.setDataBuffer(body);
message.setSequence(5);

try {
	const result = await receiveTransactionsData({ connectionId: "trace-1", message });
	console.log("replies:", result.messages.length);
} catch (error) {
	console.log("threw:", (error as Error).message);
}

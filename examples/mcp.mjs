/**
 * Talks to the Tlacuilo MCP server the way an agent does: x402 MCP client, USDC on Solana.
 *
 *   node mcp.mjs                           -> lists the tools and calls the free `catalog` tool
 *   node mcp.mjs --pay <tool> [json-args]  -> pays and calls one tool (default args: the catalog example)
 *
 * Example: node mcp.mjs --pay uma '{"anio":"2026"}'
 *
 * The wallet lives in ./wallet.json (current directory); it is created on first run and the
 * address is printed so you can fund it with a little USDC on Solana mainnet. No SOL is needed.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { wrapMCPClientWithPayment, x402Client } from "@x402/mcp";
import { registerExactSvmScheme } from "@x402/svm/exact/client";
import { createKeyPairSignerFromPrivateKeyBytes } from "@solana/kit";

const serverUrl = "https://tlacuilo-jet.vercel.app/mcp";
const walletFile = resolve(process.cwd(), "wallet.json");

const argv = process.argv.slice(2);
const payIdx = argv.indexOf("--pay");
const payTool = payIdx >= 0 ? argv[payIdx + 1] : undefined;
const payArgs = payIdx >= 0 && argv[payIdx + 2] ? JSON.parse(argv[payIdx + 2]) : undefined;
if (payIdx >= 0 && !payTool) {
  console.error("Usage: node mcp.mjs --pay <tool> [json-args]");
  process.exit(1);
}

function loadOrCreateSecret() {
  if (existsSync(walletFile)) {
    return Buffer.from(JSON.parse(readFileSync(walletFile, "utf8")).secretHex, "hex");
  }
  const secret = randomBytes(32);
  writeFileSync(
    walletFile,
    JSON.stringify({ secretHex: secret.toString("hex"), note: "Tlacuilo test wallet (Solana). Fund with cents of USDC only." }, null, 2),
  );
  console.log("Created", walletFile);
  return secret;
}

const signer = await createKeyPairSignerFromPrivateKeyBytes(new Uint8Array(loadOrCreateSecret()));
console.log("Wallet (Solana):", signer.address);

const paymentClient = registerExactSvmScheme(new x402Client(), { signer });
const client = wrapMCPClientWithPayment(new Client({ name: "tlacuilo-example", version: "1.0.0" }), paymentClient, {
  autoPayment: true,
  onPaymentRequested: ({ toolName, paymentRequired }) => {
    const a = paymentRequired.accepts[0];
    console.log(`Payment requested for ${toolName}: ${a.amount} base units of USDC on ${a.network}`);
    return true;
  },
});

console.log("Connecting to", serverUrl);
await client.connect(new StreamableHTTPClientTransport(new URL(serverUrl)));

const { tools } = await client.listTools();
console.log(`\n${tools.length} tools:`);
for (const t of tools) console.log(` - ${t.name}${t._meta?.["x402/price"] ? ` (${t._meta["x402/price"]})` : " (free)"}`);

const text = (r) => r.content?.find((c) => c.type === "text")?.text ?? "";

const catalog = JSON.parse(text(await client.callTool("catalog", {})));
console.log(`\ncatalog: ${catalog.tools.length} paid tools, networks ${catalog.payment.networks.join(", ")}`);

if (payTool) {
  const entry = catalog.tools.find((t) => t.name === payTool);
  if (!entry) {
    console.error(`Unknown tool: ${payTool}. Tools: ${catalog.tools.map((t) => t.name).join(", ")}`);
    process.exit(1);
  }
  const args = payArgs ?? entry.example ?? {};
  console.log(`\nCalling ${payTool} (${entry.price_usd}) with`, JSON.stringify(args));
  const result = await client.callTool(payTool, args);
  console.log("paymentMade:", Boolean(result.paymentMade), "isError:", Boolean(result.isError));
  if (result.paymentResponse) console.log("settlement:", JSON.stringify(result.paymentResponse, null, 2));
  console.log("result:", text(result).slice(0, 800));
} else {
  console.log("\nTo pay for one tool: node mcp.mjs --pay <tool> [json-args]   e.g. node mcp.mjs --pay uma");
}

await client.close();

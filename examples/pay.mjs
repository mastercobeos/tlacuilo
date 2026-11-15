/**
 * Pays one Tlacuilo endpoint over HTTP the way an agent does: x402 client, USDC on Solana.
 *
 *   node pay.mjs              -> creates ./wallet.json if missing and prints its Solana address
 *   node pay.mjs --pay [url]  -> pays the endpoint (default: /api/v1/uma) and prints the response
 *
 * Fund the printed address with a little USDC on Solana mainnet before paying.
 * No SOL is needed: the server sponsors the transaction fee.
 * The wallet lives in ./wallet.json (current directory). Keep it out of git; it is only for cents.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { x402Client, wrapFetchWithPayment, decodePaymentResponseHeader } from "@x402/fetch";
import { registerExactSvmScheme } from "@x402/svm/exact/client";
import { createKeyPairSignerFromPrivateKeyBytes } from "@solana/kit";

const walletFile = resolve(process.cwd(), "wallet.json");
const defaultUrl = "https://tlacuilo-jet.vercel.app/api/v1/uma";

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

if (!process.argv.includes("--pay")) {
  console.log("Fund it with a little USDC on Solana mainnet, then run: node pay.mjs --pay [url]");
  process.exit(0);
}

const url = process.argv.find((a) => a.startsWith("http")) ?? defaultUrl;
const client = registerExactSvmScheme(new x402Client(), { signer });
const payFetch = wrapFetchWithPayment(fetch, client);

console.log("GET", url);
const res = await payFetch(url);
console.log("status:", res.status);
const receipt = res.headers.get("payment-response");
if (receipt) console.log("settlement:", JSON.stringify(decodePaymentResponseHeader(receipt), null, 2));
console.log("body:", (await res.text()).slice(0, 800));

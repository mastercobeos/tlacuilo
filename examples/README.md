# Examples

Two small Node clients (Node 20+) that pay Tlacuilo with USDC on Solana: one over plain HTTP (`@x402/fetch`), one over MCP (`@x402/mcp`). Each call costs between $0.001 and $0.05.

## 1. Install

```bash
cd examples
npm install
```

## 2. Create and fund a test wallet

```bash
node pay.mjs
```

The first run writes `./wallet.json` in the current directory and prints its Solana address. Send it a little USDC on Solana mainnet (a dollar covers hundreds of calls). No SOL is needed: Tlacuilo sponsors the transaction fee. `wallet.json` is git-ignored; treat it as a throwaway wallet for cents.

## 3. Run

HTTP, one endpoint (default `/api/v1/uma`):

```bash
node pay.mjs --pay
node pay.mjs --pay "https://tlacuilo-jet.vercel.app/api/v1/banxico/fix"
node pay.mjs --pay "https://tlacuilo-jet.vercel.app/api/v1/web/read?url=https://example.com"
```

MCP, list tools and call the free `catalog`, then pay for one tool:

```bash
node mcp.mjs
node mcp.mjs --pay uma
node mcp.mjs --pay sec_filings '{"ticker":"AAPL","form":"10-K"}'
```

Both scripts print the price before paying and the settlement receipt (transaction reference) after. Prices, parameters and a runnable example for every tool are in the free catalog at https://tlacuilo-jet.vercel.app/api/v1.

To pay on Base instead, register the EVM scheme (`@x402/evm`, a viem account) in place of `registerExactSvmScheme`; see the main README.

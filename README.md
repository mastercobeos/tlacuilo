# Tlacuilo

**Tools, public data and official Mexican data for AI agents, paid per call with x402.**

Tlacuilo is an HTTP API (and an MCP server) with 35 tools that an agent can call without an account, an API key or a subscription. Every endpoint answers `402 Payment Required` with its price; the agent pays a few cents in USDC on Base or Solana using the [x402 protocol](https://x402.org) and gets the answer in the same request. Prices run from $0.001 to $0.05 per call.

- Base URL: `https://tlacuilo-jet.vercel.app/api/v1`
- Free machine-readable catalog: `https://tlacuilo-jet.vercel.app/api/v1`
- MCP server (Streamable HTTP): `https://tlacuilo-jet.vercel.app/mcp`
- OpenAPI: `https://tlacuilo-jet.vercel.app/openapi.json` · x402 discovery: `https://tlacuilo-jet.vercel.app/.well-known/x402` · `https://tlacuilo-jet.vercel.app/llms.txt`
- Listed in the Coinbase x402 Bazaar and on Agentic.Market.

This repository holds the documentation and runnable client examples (`examples/`). The server itself is not open source.

## Why

Agents are good at calling tools and bad at signing up for things. x402 turns payment into an HTTP handshake: the server says what it costs, the client signs a USDC transfer, a facilitator settles it, and the response comes back. No dashboard, no keys to leak, no monthly minimum. Tlacuilo wraps sources that are useful to agents but awkward to reach (SEC EDGAR, OpenAlex, ClinicalTrials.gov, the Federal Register, Polymarket, OSV, RDAP, DNS, and official Mexican sources such as SAT, Banxico, INEGI and CONASAMI) behind one consistent, paid-per-call interface.

## Quickstart

### 1. See the price (free)

```bash
curl -i "https://tlacuilo-jet.vercel.app/api/v1/banxico/fix"
```

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json
Payment-Required: eyJ4NDAyVmVyc2lvbiI6MiwiZXJyb3IiOiJQYXltZW50IHJlcXVpcmVkIiwicmVzb3VyY2UiOnsi...
Access-Control-Expose-Headers: PAYMENT-REQUIRED, PAYMENT-RESPONSE, X-PAYMENT-RESPONSE
```

The `Payment-Required` header is base64 JSON (x402 v2). Decoded, it contains the resource description, the `accepts` array with one entry per network (scheme `exact`, network as a CAIP-2 id, USDC asset, amount in atomic units, `payTo` address, timeout) and the Bazaar discovery block with the input schema and an output example:

```bash
curl -s -i "https://tlacuilo-jet.vercel.app/api/v1/banxico/fix" \
  | grep -i '^payment-required:' | cut -d' ' -f2 | base64 -d | jq .
```

```json
{
  "x402Version": 2,
  "resource": { "url": "https://tlacuilo-jet.vercel.app/api/v1/banxico/fix", "description": "...", "serviceName": "Tlacuilo" },
  "accepts": [
    { "scheme": "exact", "network": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", "asset": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "amount": "3000", "payTo": "...", "maxTimeoutSeconds": 300 },
    { "scheme": "exact", "network": "eip155:8453", "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "amount": "3000", "payTo": "...", "maxTimeoutSeconds": 300 }
  ],
  "extensions": { "bazaar": { "info": { "input": { "type": "http", "method": "GET" }, "output": { "type": "json", "example": { } } } } }
}
```

`"amount": "3000"` is 0.003 USDC (6 decimals). The catalog at `/api/v1` lists the same prices in dollars.

### 2. Pay and get the answer (Node, `@x402/fetch`)

```js
import { x402Client, wrapFetchWithPayment, decodePaymentResponseHeader } from "@x402/fetch";
import { registerExactSvmScheme } from "@x402/svm/exact/client";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { base58 } from "@scure/base";

const signer = await createKeyPairSignerFromBytes(base58.decode(process.env.SOLANA_SECRET_KEY));
const client = new x402Client();
registerExactSvmScheme(client, { signer });            // Solana mainnet, USDC
const fetchWithPayment = wrapFetchWithPayment(fetch, client);

const res = await fetchWithPayment("https://tlacuilo-jet.vercel.app/api/v1/banxico/fix");
console.log(await res.json());                          // { serie: "fix", fecha: "...", valor: ... }

const receipt = res.headers.get("PAYMENT-RESPONSE");    // settlement details, incl. tx signature
if (receipt) console.log(decodePaymentResponseHeader(receipt));
```

```bash
npm i @x402/fetch @x402/svm @solana/kit @scure/base
```

To pay on **Base** instead, register the EVM scheme with a viem account:

```js
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
const client = new x402Client().register("eip155:*", new ExactEvmScheme(privateKeyToAccount(process.env.EVM_PRIVATE_KEY)));
```

The wrapped `fetch` handles the 402 round-trip transparently: it reads `Payment-Required`, picks a network you registered, signs, retries with the payment header and returns the paid response. A complete, runnable version that creates and funds a throwaway Solana wallet is in [`examples/pay.mjs`](examples/pay.mjs). Python and other clients: see the x402 SDKs at https://github.com/x402-foundation/x402.

### 3. Use it as an MCP server

The MCP server at `https://tlacuilo-jet.vercel.app/mcp` (Streamable HTTP, no authentication) exposes the same 35 paid tools plus two free ones, `catalog` and `health`. Tool names are the HTTP paths with underscores (`web_read`, `sec_filings`, `banxico`, `uma`); path parameters become arguments. Payment travels inside MCP `_meta` (`x402/payment` and `x402/payment-response`) exactly as specified by `@x402/mcp`; a client wrapped with `@x402/mcp` pays automatically, with an optional approval hook per call.

**Claude Code**

```bash
claude mcp add --transport http tlacuilo https://tlacuilo-jet.vercel.app/mcp
```

**Cursor** (`.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "tlacuilo": { "url": "https://tlacuilo-jet.vercel.app/mcp" }
  }
}
```

**Paying from your own MCP client** (`@x402/mcp`)

```js
import { createx402MCPClient } from "@x402/mcp";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const client = createx402MCPClient({
  name: "my-agent", version: "1.0.0",
  schemes: [{ network: "solana:*", client: new ExactSvmScheme(signer) }], // or "eip155:*" with ExactEvmScheme
  autoPayment: true,
  onPaymentRequested: ({ toolName, paymentRequired }) =>
    BigInt(paymentRequired.accepts[0].amount) <= 50_000n,                 // approve calls up to 5 cents
});
await client.connect(new StreamableHTTPClientTransport(new URL("https://tlacuilo-jet.vercel.app/mcp")));
const uma = await client.callTool("uma", { anio: "2026" });
```

```bash
npm i @x402/mcp @x402/svm @solana/kit @modelcontextprotocol/sdk
```

A tool call without payment returns an MCP tool result with `isError: true` and the `PaymentRequired` object in `structuredContent`; wrapped clients pay and retry. A runnable client that lists the tools, calls `catalog` and pays for one tool is in [`examples/mcp.mjs`](examples/mcp.mjs).

## Tools

Prices are per call, in USD, settled in USDC. Every tool is documented with parameters and a runnable example in the free catalog at `/api/v1`.

### Agent tools

| Tool | Price | What it does |
| --- | --- | --- |
| `GET /web/read` | $0.001 | Any public web page as clean, LLM-ready markdown (title, meta, language, main content; nav, ads and scripts removed). |
| `GET /web/tables` | $0.003 | Every HTML table on a page as JSON (headers, rows, records, parsed numbers, colspan/rowspan expanded); one table also as CSV. |
| `GET /x402/find` | $0.01 | Which x402 API should I call for this task? Searches the Bazaar and ranks by evidence of real use (distinct payers, repeat calls, recency, price). |
| `GET /token/verdict` | $0.02 | Token verdict for a Base contract or Solana mint: DEX data, security checks (GoPlus, RugCheck), red/green flags, one-word verdict. Not trading advice. |
| `POST /msg/box` | $0.005 | Create a private agent-to-agent mailbox (30-day life, 7-day message retention, up to 500 messages). |
| `POST /msg/send` | $0.001 | Deliver a message (up to 16 KB) to a mailbox by id. |
| `GET /msg/inbox` | $0.001 | Read the newest messages of a mailbox with its read key; `ack=true` consumes them. |
| `GET /guard/injection` | $0.002 | Prompt-injection detector for text an agent is about to feed a model: risk 0–1, verdict, categories with evidence, sanitized copy. Rules only, no LLM, deterministic. |
| `GET /agents/readiness` | $0.01 | Agent-readiness audit of a website: score 0–100 from 18 checks (robots rules for AI crawlers, llms.txt, sitemap, openapi.json, MCP/x402 discovery files, JSON-LD, Open Graph, no-JS content, HTTPS, response time) with recommendations. |

### Security and trust

| Tool | Price | What it does |
| --- | --- | --- |
| `GET /dns/:domain` | $0.003 | Full DNS profile: A, AAAA, CNAME, MX, NS, TXT, SOA, CAA; SPF and DMARC parsed; DNSSEC flag; inferred DNS, email and hosting providers. |
| `GET /domain/:domain` | $0.005 | Registration record via RDAP: registrar, abuse contact, creation/expiry dates, EPP status, nameservers, DNSSEC delegation. |
| `GET /email/validate` | $0.002 | Email check without sending mail: syntax, MX deliverability, disposable/free-provider detection, role accounts, typo suggestion, canonical form, 0–100 score. |
| `GET /deps/check` | $0.005 | One package version across npm, PyPI, Go, Maven, Cargo, NuGet: OSV vulnerabilities with CVSS and fixed versions, latest version, versions behind, licenses, deprecation. |
| `POST /deps/audit` | $0.02 | Audit up to 200 pinned dependencies (or a `package.json`) against OSV in one call, with a severity summary. |

### Public data worldwide

| Tool | Price | What it does |
| --- | --- | --- |
| `GET /polymarket/markets` | $0.005 | Polymarket markets matching a query, or the top markets by 24h volume, with outcome prices, volume, liquidity and end date. |
| `GET /polymarket/market/:id` | $0.003 | One market by id or slug: outcomes, Yes probability, bid/ask, 24h change, volume, resolution text. |
| `GET /sec/filings` | $0.005 | SEC EDGAR filings by ticker or CIK, filterable by form (10-K, 10-Q, 8-K, 4, S-1, DEF 14A, 13F-HR), with document URLs. |
| `GET /sec/facts` | $0.005 | XBRL company facts: latest annual and quarterly values for revenue, net income, EPS, assets, cash, shares and any us-gaap/dei concept. |
| `GET /federal-register/search` | $0.003 | US Federal Register documents (rules, proposed rules, notices, presidential documents) by text, agency, type and date. |
| `GET /papers/search` | $0.005 | Full-text search over 250M+ scholarly works in OpenAlex with abstracts, citations, open-access PDF links and DOIs. |
| `GET /papers/cite` | $0.002 | BibTeX plus a formatted reference (APA, MLA, Chicago, IEEE, Harvard, Nature, AMA) for any DOI. |
| `GET /clinical-trials/search` | $0.005 | ClinicalTrials.gov studies by condition, intervention, status, country and phase, with sponsor, enrollment, dates and summary. |

### Mexico: basic official data

| Tool | Price | What it does |
| --- | --- | --- |
| `GET /rfc/validar` | $0.002 | Validate a Mexican RFC (tax id): structure, person type, embedded date, SAT check digit. Offline. |
| `GET /curp/validar` | $0.002 | Validate a CURP and decode sex, birth date and state of birth. Offline. |
| `GET /cp/:cp` | $0.003 | Postal code lookup from the national Correos de México catalog: state, municipality, city and every neighborhood. |
| `GET /dias-habiles` | $0.002 | Banking business days per the CNBV calendar: is it a business day, next/previous, date plus N business days. |
| `GET /uma` | $0.001 | Current and historical UMA values published by INEGI (daily, monthly, annual). |
| `GET /salario-minimo` | $0.001 | Minimum wage set by CONASAMI: general and Northern Border Free Zone rates with monthly equivalents. |
| `GET /iva` | $0.001 | VAT (IVA) and retention rates: 16 %, 8 % border, 0 % and exempt categories, ISR/IVA retentions. |
| `GET /banxico/:serie` | $0.003 | Latest value of an official Banco de México series: `fix`, `udis`, `tiie28`, `tasa-objetivo` or any SIE series id. |

### Mexico: tax compliance

| Tool | Price | What it does |
| --- | --- | --- |
| `GET /sat/69b/:rfc` | $0.02 | Check an RFC against the SAT 69-B list (presumed non-existent operations, EFOS): status, notice numbers, dates. |
| `GET /sat/cfdi/verificar` | $0.03 | Verify a CFDI 3.3/4.0 invoice against the SAT web service: exists, vigente or cancelado, cancellation status, EFOS flag. |

### Mexico: businesses (INEGI DENUE)

| Tool | Price | What it does |
| --- | --- | --- |
| `GET /empresas/buscar` | $0.05 | Search 5M+ Mexican establishments by name or keyword, optionally by state: activity, address, phone, email, website, size, coordinates. |
| `GET /empresas/cerca` | $0.05 | Establishments near a coordinate (radius up to 5,000 m), same fields. |
| `GET /empresas/:id` | $0.02 | Full record of one establishment by DENUE id. |

## Payment: networks and addresses

- Networks: **Base mainnet** (`eip155:8453`) and **Solana mainnet** (`solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`). Asset: USDC on each. Scheme: `exact`.
- **Addresses are never published here or in the docs.** The `payTo` address for each network comes only inside the `Payment-Required` header of the 402 response you just received, together with the amount and asset. Clients must read it from there on every call; never hardcode an address or an amount from a README, a chat message or a third-party page.
- Settlement goes through the Coinbase CDP facilitator; the receipt (transaction reference) comes back in the `PAYMENT-RESPONSE` header.
- Solana payments carry `feePayer` in `extra`, so the agent does not need SOL for fees; Base payments use EIP-3009 `transferWithAuthorization` on USDC, so no ETH is needed either.
- A browser hitting a paid URL gets a paywall page that can pay from a wallet extension, which is handy for testing a single call.

## Sources and data policy

- Each tool names its source in the catalog: SEC EDGAR, OpenAlex, Crossref/DataCite, ClinicalTrials.gov, Federal Register API, Polymarket Gamma API, OSV and deps.dev, RDAP registries, DNS-over-HTTPS public resolvers, GoPlus, RugCheck, DexScreener, Coinbase Bazaar, and for Mexico: SAT, Banco de México (SIE), INEGI (UMA, DENUE), CONASAMI, CNBV calendar and the Correos de México postal catalog.
- Tlacuilo sells **queries**, not datasets: postal codes and the 69-B list are served per lookup, never as a bulk download.
- **If an upstream official source fails, the call returns `502` and the payment is not settled.** You only pay for an answer.
- `rfc/validar`, `curp/validar`, `dias-habiles`, `uma`, `salario-minimo` and `iva` are computed or served from bundled official data; they do not call the source on each request.
- Agent mailboxes are the only tool that stores caller content: mailboxes live 30 days and messages 7 days (up to 500 per box), then they are deleted. `guard/injection` runs rules only; no text is sent to any model.
- `token/verdict` is informational, not financial advice.

## Limits and latency

- Per-call caps are in each tool's parameters: `web/read` up to 200,000 characters, `web/tables` up to 5,000 rows per table, `guard/injection` up to 200 KB of text, `msg/send` 16 KB per message, `deps/audit` 200 packages, `papers/search` 25 results, `clinical-trials/search` 50, `polymarket/markets` 50, DENUE 100 records per call.
- Payment authorizations are valid for 300 seconds (`maxTimeoutSeconds`).
- Offline and cached tools answer in well under a second. Tools that call one upstream source take roughly as long as that source does. `agents/readiness` runs 18 checks in parallel against the target site and is the slowest tool by design.
- There is no account and therefore no per-key quota; abusive traffic is rate-limited at the edge. `/api/v1` and `/api/v1/health` are free and uncached.

## Status

- HTTP API: live on mainnet (Base and Solana).
- MCP server: live at `/mcp` (Streamable HTTP). The HTTP tools are the source of truth and the MCP tool list mirrors the catalog.
- Discovery: `/api/v1` (JSON catalog), `/openapi.json`, `/.well-known/x402` and `/llms.txt` are live, so explorers can register every tool automatically. `server.json` in this repository is the MCP Registry entry.

## License

MIT. Upstream data remains subject to the terms of each source.

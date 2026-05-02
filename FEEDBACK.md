# Uniswap API Integration Feedback

## Project Context

SwarmSwap is an autonomous LP management swarm built on 0G + Sepolia. A multi-agent system (Analyzer + Risk specialist agents) uses live ETH/USDC price data from Ethereum mainnet to drive rebalancing decisions, then executes swaps on Sepolia via the Uniswap protocol.

---

## What Worked

- **SwapRouter02 direct integration** was smooth and well-specified. The ABI, function selectors, and parameter encoding are clearly documented. Manually encoding `exactInputSingle` calldata via `ethers.Interface` worked first time once the struct field order was matched to the deployed contract.
- **Pool factory pattern** (`getPool(tokenA, tokenB, fee)`) made pool discovery clean — no hardcoded pool addresses needed beyond the factory.
- **Native ETH handling** via `msg.value` with WETH as `tokenIn` on SwapRouter02 worked as expected. The router auto-wraps ETH, which simplifies the agent's signing flow significantly.
- **Sepolia deployment** of Uniswap V3 (SwapRouter02, Factory, WETH, USDC) was available and functional, which made testnet development practical.
- **`slot0().tick`** from the pool contract is an excellent price oracle for agents — on-chain, manipulation-resistant, and zero external dependency. Using mainnet ETH/USDC 0.05% pool tick as the price signal for autonomous decision-making worked very well.

---

## What Did Not Work

- **Uniswap Trading API (`trade-api.gateway.uniswap.org/v1/quote`) on Sepolia**: The API either returned no `methodParameters` or failed with routing errors for Sepolia chain IDs. Testnet liquidity and routing paths are not well-supported. We implemented a direct SwapRouter02 fallback for this reason.
- **API key requirement was unclear**: The documentation does not clearly state whether an API key is required for testnet usage or whether a public rate-limited tier exists. Unauthenticated requests failed intermittently without a clear error message distinguishing auth failures from routing failures.
- **No TypeScript types published for the Trading API response**: The response shape had to be inferred from trial-and-error. A published `@uniswap/trading-api-types` package would meaningfully reduce integration friction.

---

## Bugs Encountered

- The Trading API response structure differs between routing modes (`CLASSIC` vs `DUTCH_LIMIT`): `methodParameters` is present in CLASSIC but absent in DUTCH_LIMIT responses with no documented field to distinguish the two before parsing. This caused silent null returns in our quote handler.
- `AbortSignal.timeout()` + `fetch` occasionally threw unhandled `TimeoutError` on Node.js v24 when the API was slow to respond; a try/catch around the fetch was required even when the signal was set.

---

## Documentation Gaps

- The `slippageTolerance` field unit is not documented — it accepts a percentage string (`"0.5"` for 0.5%) but this is not stated explicitly anywhere in the current docs.
- No documentation on which chain IDs are supported for `tokenInChainId`/`tokenOutChainId`. Developers have to guess or check the frontend source.
- The `swapper` field purpose (used as `recipient` in the encoded calldata) is not explained — it reads like a metadata field but is functionally critical.
- No example request/response pairs for Sepolia in the docs. Mainnet examples only.

---

## Developer Experience Friction

- **No SDK wrapper**: Integrating the Trading API requires raw `fetch` calls with manually constructed JSON bodies. A lightweight `@uniswap/trading-api-client` with TypeScript types would reduce integration time from hours to minutes for agent builders.
- **Error messages are opaque**: A 400 response often returns `{"errorCode":"GENERIC_ERROR"}` with no actionable detail. Structured error codes (e.g., `NO_ROUTE_FOUND`, `INSUFFICIENT_LIQUIDITY`, `UNSUPPORTED_CHAIN`) would allow agents to implement smarter fallback logic.
- **Testnet gap**: Building agents that swap autonomously requires a functioning testnet path. The gap between mainnet API support and Sepolia support forced us to maintain two code paths (API + direct encoding), which increases maintenance burden.

---

## Missing Endpoints / Desired Features

- **`/v1/quote` for testnets**: First-class Sepolia and Base Sepolia support would be a significant DX improvement for hackathon and early-stage builders.
- **Streaming price feed endpoint**: Agents need continuous price updates. A WebSocket or SSE endpoint for real-time pool tick/price data would be highly valuable for autonomous agent use cases.
- **Agent-optimized batch quote**: An endpoint accepting multiple `(tokenIn, tokenOut, amount)` tuples and returning quotes in a single round-trip would reduce latency for swarm agents evaluating multiple rebalancing paths simultaneously.
- **Quote with gas estimate included**: Currently, developers must call `estimateGas` separately after getting a quote. Including a `gasEstimate` field in the quote response would simplify the agent execution flow.

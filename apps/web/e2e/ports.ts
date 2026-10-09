/**
 * Ports for one e2e process. Two things share a box: shards of one run (`PODWAY_E2E_SHARD`), and —
 * the bug of 2026-10-08 — two CI RUNS at once on the two self-hosted runners (podbay-box, podbay-box-2).
 * Ports used to depend on the shard only, so two PRs' shard 1 fought over the same ports: one server
 * failed to bind, or one run's tests hit the OTHER run's server (timeouts + odd failures). The runner
 * (GitHub sets RUNNER_NAME; "…-2" → slot 1) now offsets them too. Local runs: slot 0, shard 0 = the
 * original ports.
 */
const SHARD = Number(process.env.PODWAY_E2E_SHARD ?? 0);
const SLOT = Number(/-(\d+)$/.exec(process.env.RUNNER_NAME ?? "")?.[1] ?? 1) - 1;
const OFFSET = (Math.max(0, SLOT) * 4 + SHARD) * 20;

export const WEB_PORT = 3111 + OFFSET;
export const AGENT_PORT = 8790 + OFFSET;
export const GATEWAY_PORT = 8791 + OFFSET;
/** Far from every slot/shard's agent+gateway pair (offsets stay < 1000). */
export const UNAUTHED_AGENT_PORT = AGENT_PORT + 1000;

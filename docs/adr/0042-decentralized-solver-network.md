# ADR-0042 — Decentralized Solver Network: competitive execution with verified-not-trusted proposals

- Status: Accepted
- Date: 2026-07-05
- Deciders: CTO, Principal Protocol Architect, Principal Distributed Systems Engineer, Principal Blockchain Researcher, Principal Marketplace Architect

## Context

A single internal route optimizer caps execution quality at what one algorithm can find, and makes execution a single point of failure. The intents-based model (UniswapX / Across / Anoma) lets independent solvers compete — better prices, resilience, and a network business line — but only if the platform can trust the winner without trusting the solvers. The hard problem is selecting a competitive proposal that is real, without letting a solver lie, front-run, spam, or Sybil its way to the top.

## Decision

A **standalone `packages/solver`** where staked, registered solvers compete to satisfy a `SolveRequest`. The platform is the coordinator: it **seals** collection (no solver sees another's proposal before evaluation → nothing to front-run), then for each proposal runs a verification gauntlet — eligibility (staked, not banned), content-hash integrity, deadline, **delivers the required minimum**, slippage cap, provider allow/deny — and, critically, an **independent SIMULATION**: it re-computes the output the proposed route would actually deliver and rejects any over-claim, **slashing the solver** for it. Survivors are scored on a reputation-weighted min-max blend and the best wins, deterministically. Reputation is earned from history (security incidents dominate); incentives reward a share of delivered savings and slash misbehavior by severity. Solvers PROPOSE only — the winner still clears Risk + Policy + a device signature via settlement; solvers never hold keys or sign. It is standalone (no internal deps) — the network as its own product line.

## Alternatives considered

| Option                                                     | Pros                                                                            | Cons                                                            | Verdict                                                        |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------- |
| **Competitive solvers, verified-not-trusted + reputation** | best price/resilience; a network business line; robust to lying/Sybil/front-run | more machinery than one optimizer                               | **chosen**                                                     |
| Single internal route optimizer only                       | simplest                                                                        | caps quality; single point of failure; no network effect        | rejected (kept as the "house solver" baseline)                 |
| Trust solver-reported outputs; select on claims            | trivial                                                                         | a solver just claims the best numbers and wins — fake proposals | rejected (independent simulation; claims are checked)          |
| Open (unstaked) submission                                 | permissionless                                                                  | trivial Sybil + spam                                            | rejected (stake gate; slashing)                                |
| Streaming/first-seen proposal selection                    | low latency                                                                     | front-running — later solvers copy-and-undercut                 | rejected (sealed window; evaluate together)                    |
| No slashing (reputation only)                              | no capital needed                                                               | lying is free; a fresh identity resets reputation               | rejected (slashing makes lying costly; stake anchors identity) |

## Consequences

- **Maintenance:** a new verification rule is one check; a new scoring factor is one weight; reputation + incentives are pure functions — all tested offline (over-claim slash, Sybil exclusion, tamper rejection, deterministic reputation-weighted selection).
- **Scaling:** stateless per-request coordination; the registry + reputation are simple stores; sealed collection parallelizes across solvers; the network scales by adding solvers, not platform code.
- **Security:** claims are verified by independent simulation, not trusted (over-claims are slashed); staking + slashing make Sybil/spam/lying costly; sealed collection removes front-running; the winner still clears Risk + Policy + a device signature; solvers hold no keys and never sign. Full design: [architecture 23](../architecture/23-solver-network.md).

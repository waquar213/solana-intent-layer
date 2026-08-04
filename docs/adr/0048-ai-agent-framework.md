# ADR-0048 — AI Agent Framework: bounded, propose-only specialist agents

- Status: Accepted
- Date: 2026-07-06
- Deciders: CTO, Principal AI Architect, Principal Security Engineer

## Context

A single copilot is limited; specialized agents (portfolio analyst, tax, security) compose into richer help. But a multi-agent system is MORE dangerous than one AI — more surface, more autonomy, more ways to loop, escalate, or act. The framework must make agents strictly propose-only and bounded.

## Decision

A **`packages/agents`** framework where each agent has a name, a bounded scope, and an **allow-list of read-only tools** (via the [plugins](../architecture/27-plugin-marketplace.md) capability model). A deterministic **orchestrator** routes a request to specialist agents, composes their **typed PROPOSALS**, and enforces bounds: a **strict planning-vs-execution split** (agents propose typed actions; deterministic code verifies; the device signs — an agent can NEVER execute or sign), **tool routing** through a capability registry (which agent may call which read-only tool), **bounded orchestration** (max hops, no loops, a budget), and **fact-grounded verification** of every agent output exactly like the [copilot](../architecture/20-ai-copilot.md). The same doctrine as one AI, applied harder: propose → verify → dispose, with capability + hop bounds.

## Alternatives considered

| Option                                                                            | Verdict                                            |
| --------------------------------------------------------------------------------- | -------------------------------------------------- |
| **Bounded propose-only agents + deterministic orchestrator + capability routing** | **chosen**                                         |
| Autonomous agents that can call fund-moving tools                                 | rejected (breaks non-custodial; agents never sign) |
| Unbounded agent loops (react-style)                                               | rejected (max hops, no loops, budget)              |
| Trust agent output directly                                                       | rejected (fact-grounded verification like copilot) |

## Consequences

- **Capability:** specialist agents compose into richer, still-safe help; adding an agent is one bounded contract.
- **Security:** an agent can propose but never sign/execute; tools are read-only and capability-gated; orchestration can't loop or exceed its budget; output is verified. Full design: [architecture 29](../architecture/29-ai-agent-framework.md).

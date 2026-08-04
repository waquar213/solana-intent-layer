# ADR-0007 — Backend runtime Node.js, API framework Fastify

- Status: Accepted
- Date: 2026-07-05
- Deciders: CTO, Backend Lead

## Context

Backend services need shared Zod contracts with clients ([ADR-0002](0002-primary-language-typescript.md)), high I/O concurrency (RPC fan-out, LLM calls), first-class OpenAPI generation, and low overhead.

## Decision

**Node.js (22 LTS)** runtime; **Fastify** as the HTTP framework, with structured modules (a "NestJS-style" module layout without Nest's decorator weight). OpenAPI generated from Zod via `packages/api-contracts`.

## Alternatives considered

| Option               | Pros                                                                                | Cons                                                    | Verdict                                            |
| -------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------- |
| **Fastify**          | fastest mainstream Node framework, schema-first, plugin encapsulation, low overhead | less prescriptive than Nest                             | **chosen**                                         |
| NestJS               | structure, DI, ecosystem                                                            | heavier, decorator/reflection cost, more magic          | rejected (borrow its module shape, not its weight) |
| Express              | ubiquitous                                                                          | slow, unmaintained core, manual everything              | rejected                                           |
| Hono / edge runtimes | tiny, edge-ready                                                                    | our workloads are RPC/LLM-bound, not edge-latency-bound | rejected for core services                         |

## Consequences

- **Maintenance:** schema-first handlers keep validation and docs in sync (generated, never hand-written); module encapsulation supports the modular-monolith→services path ([ADR-0027](0027-deployment-topology.md)).
- **Scaling:** event-loop concurrency suits I/O-bound fan-out; horizontal pods behind the gateway; hot inter-service calls can adopt gRPC where profiled.
- **Security:** Zod validation at every boundary (untrusted input never reaches domain logic unparsed); minimal framework surface to harden.

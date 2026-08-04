# ADR-0046 — Plugin Marketplace: a capability-sandboxed, trust-tiered extension platform

- Status: Accepted
- Date: 2026-07-05
- Deciders: CTO, Principal Platform Architect, Principal SDK Architect, Principal Security Engineer, Principal Marketplace Architect, Principal Developer Experience Engineer

## Context

To become an ecosystem rather than a closed product, third parties must be able to extend the platform (new providers, analytics, automations, chains) without modifying core — and without ever being able to compromise security, privacy, performance or stability. A wallet is the worst possible place to run untrusted third-party code: keys and funds are one bug away. So the extension model must make the dangerous things structurally impossible, not merely discouraged, while still giving developers a good experience.

## Decision

Build a **standalone `packages/plugins`** security core — the Extension SDK's enforcement — under the platform doctrine: **a plugin proposes, deterministic code verifies, the device signature disposes.** Its pillars:

- **Capability permissions with a structural exclusion.** Ten granular, explicitly-approved permissions; keys, signing, internal DBs and security internals are **not in the vocabulary** — a plugin cannot request them, the capability gate denies those method names unconditionally, and the sandbox never puts them on the API surface. Deny-by-default for anything ungated.
- **Trust levels** (official / verified / community / experimental) as a **hard permission ceiling** plus a visible badge + warnings — an experimental plugin cannot hold `background.execute` regardless of user approval; user approval is a second, independent gate.
- **Verified, not trusted.** A signing gauntlet: bundle-hash integrity, signature verification over the canonical manifest (permissions/trust/codeHash all covered), an authorized signer whose `maxTrust` permits the claimed level, and revocation — all-or-nothing, fail closed. Automatic revocation instantly suspends running plugins.
- **Bounded + revocable runtime.** Resource limits clamped to the trust ceiling; a lifecycle state machine; decide-not-act health monitoring that auto-suspends a crash-looping or permission-violating plugin (never auto-resumes).
- **Semver compatibility** + dependency resolution so an incompatible version can't load.

The isolate runtime, malware/static/dynamic/dependency scanners, the store, CLI, emulator and doc generator are infra that this deterministic core governs.

## Alternatives considered

| Option                                                         | Pros                                                     | Cons                                                                 | Verdict                                                     |
| -------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Capability sandbox + trust tiers + signing gauntlet (this)** | dangerous ops structurally impossible; testable; good DX | more up-front structure                                              | **chosen**                                                  |
| Trust third-party code with a permissions prompt only          | simplest                                                 | one bug near keys/funds is catastrophic; prompts get click-through   | rejected (forbidden-by-construction, not by prompt)         |
| Blocklist dangerous APIs                                       | quick                                                    | deny-lists are always incomplete; a missed method leaks a capability | rejected (allow-list + deny-by-default)                     |
| No trust levels (all plugins equal)                            | uniform                                                  | users can't make informed decisions; no ceiling on risky plugins     | rejected (trust caps capability, per the user's design)     |
| Trust-on-first-use signing (no authorized-signer check)        | fewer moving parts                                       | anyone can mint an 'official' plugin                                 | rejected (signer authority bound to attestable trust level) |
| Let plugins execute intents directly                           | powerful                                                 | breaks non-custodial; a plugin could move funds                      | rejected (`intent.create` only PROPOSES; device signs)      |

## Consequences

- **Maintenance:** a new capability is one gated method + permission; a new trust tier is one policy row; each module is a pure function, tested (forbidden-never-reachable incl. prototype keys, trust-ceiling rejection, five-check signing gauntlet, revoke-blocks-resume, deny-by-default, semver/deps — 28 tests).
- **Ecosystem:** opening from official → verified → community → experimental is additive; the forbidden-method wall, trust ceilings and signing gauntlet are fixed, so widening the ecosystem never weakens the core.
- **Security:** a plugin can never reach keys/signing/db/internals (not in the vocabulary), can never exceed its trust ceiling, runs only if verified + unrevoked, is resource-bounded, and is auto-suspended and revocable on misbehaviour; it can propose an intent but never sign. Full design: [architecture 27](../architecture/27-plugin-marketplace.md). NOTE: the multi-agent adversarial review of this package did not complete (API session limit) and should be re-run before this package is relied on in production.

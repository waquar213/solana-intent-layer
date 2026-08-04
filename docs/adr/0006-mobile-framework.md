# ADR-0006 — Mobile framework: React Native + Expo (dev-client)

- Status: Accepted
- Date: 2026-07-05
- Deciders: CTO, Mobile Lead, Security Lead

## Context

The mobile app must run the audited `@intent-wallet/core` (TypeScript) on-device with native modules only for the keystore/biometrics. Rebuilding key management in another language would create a second, drift-prone audit surface.

## Decision

**React Native** with **Expo dev-client** (custom native modules). Native code only for Secure Enclave/StrongBox integration and biometrics.

## Alternatives considered

| Option                    | Pros                                                                                    | Cons                                                                                     | Verdict                |
| ------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------- |
| **React Native + Expo**   | runs the audited TS core as-is (Hermes), shared `packages/ui`, one hiring pool with web | bridge perf ceiling on heavy lists                                                       | **chosen**             |
| Flutter                   | best raw UI perf, single codebase                                                       | forces a Dart re-implementation of key management → second audit surface, fund-loss risk | rejected (consciously) |
| Native Swift + Kotlin     | best platform fidelity                                                                  | doubles wallet-core surfaces; slowest iteration                                          | rejected               |
| Capacitor/Ionic (webview) | web reuse                                                                               | webview perf + secure-storage limitations for a wallet                                   | rejected               |

## Consequences

- **Maintenance:** one TS core shared with web/SDK; perf-critical screens (portfolio list) get targeted native optimization case-by-case rather than a whole second stack.
- **Scaling:** OTA-updatable JS (with store-policy care); EAS for phased rollouts; shared components scale UI work across platforms.
- **Security:** the crown-jewel key code exists once, audited once; native modules are a thin, reviewable shim over the OS secure hardware ([architecture 09 D13](../architecture/09-decisions.md)).

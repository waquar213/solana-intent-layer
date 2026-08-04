<!-- docs/handbook/01-standards.md §6. Keep PRs small and single-purpose. -->

## What & why

<!-- One paragraph: what this changes and the reason. Link the issue/milestone. -->

## How

<!-- Key implementation notes a reviewer needs. Call out anything non-obvious. -->

## Testing

<!-- What you tested and how. Paste evidence (test output). UI: screenshots + largest-Dynamic-Type shot. -->

## Checklist

- [ ] Single-purpose; diff is as small as it can be
- [ ] Tests added/updated; coverage meets the package's tier ([handbook 04](../docs/handbook/04-quality.md))
- [ ] `pnpm typecheck` and `pnpm test` green locally
- [ ] No secrets, keys, or PII in code, logs, errors, or fixtures
- [ ] Money values are `bigint` base units (no floats outside the display edge)
- [ ] Docs updated (package README / API spec / ADR) if behavior or contracts changed
- [ ] User-visible + incomplete ⇒ behind a feature flag
- [ ] `memory.md` updated if this changes project state

## Security impact

<!-- REQUIRED if this touches packages/core, execution, risk, auth, or crypto.
     Could a full backend compromise move funds because of this change? Must be "no". -->

## Definition of Done

<!-- Confirm all DoD items in handbook 04 §6 are met. -->

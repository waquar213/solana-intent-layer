# ADR-0016 — Push notifications: APNs/FCM behind our Notification Service

- Status: Accepted
- Date: 2026-07-05
- Deciders: Backend Lead, Mobile Lead

## Context

Execution-critical events ("Step 2 needs you", "funds received", "paused safely") must reach users fast and reliably, plus in-app inbox, email, and enterprise webhooks — all honoring preferences and rate-collapse.

## Decision

Deliver directly via **APNs and FCM**, orchestrated by our own **Notification Service** ([architecture 02 §2.13](../architecture/02-services.md)) which consumes lifecycle events, renders i18n templates, and fans out to push/inbox/email/webhook.

## Alternatives considered

| Option                     | Pros                                                         | Cons                                                                | Verdict                                            |
| -------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------- | -------------------------------------------------- |
| **APNs/FCM + own service** | no per-message vendor cost, full control, one delivery brain | we run delivery + token management                                  | **chosen**                                         |
| OneSignal/Braze            | turnkey, campaign tooling                                    | cost at scale, a vendor on the money-notification path, PII sharing | rejected for critical path (marketing later maybe) |
| Twilio/SNS mobile push     | managed                                                      | still a middleman; SNS push is thin                                 | rejected                                           |

## Consequences

- **Maintenance:** one templating + preferences + delivery-receipt system; token lifecycle managed with the device registry.
- **Scaling:** stateless workers off `notify.outbox.v1`; rate-collapse (5 price alerts → 1 digest) protects users and quotas.
- **Security:** execution-critical notifications never contain amounts+counterparty that would leak on a lock screen beyond user settings; webhooks are HMAC-signed with per-tenant secrets ([architecture 07 §9](../architecture/07-api.md)).

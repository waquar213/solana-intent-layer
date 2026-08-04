[Founder Bible](../../FOUNDER_BIBLE.md) · Project Aether · Chapter 16 of the enterprise specification

# Chapter 16 — Universal Payment Network

> **Version 3.0** · **Mission:** make sending money feel as simple as sending a WhatsApp message — regardless of blockchain, currency, or country.

**Chapter objective.** This is the charter for turning the wallet into a global payment network for
individuals, merchants, and businesses. It states the intent; the buildable detail (with each part tagged
**shipped** vs **roadmap**) is the **[Universal Payment Network Reference](../product/payment-network-reference.md)**
(Volume II). Two lines never move: **a payment is an intent — gated, device-signed, and non-custodial**
(funds move wallet-to-wallet; no server or platform account ever holds them), and **"received" means settled
on-chain, never merely broadcast.** A fiat ramp is a third-party (which does the KYC); the core wallet stays
non-custodial and KYC-free.

---

## 1. Philosophy

Today's payments make users think about **chain · network · address · token · gas · bridge.** Intent Wallet
only asks **"Who do you want to pay?"** — everything else is handled automatically.

---

## 2. Universal Payment Architecture

```
User → Payment Engine → Identity Engine → Intent Engine → Liquidity Engine → Execution Engine →
Settlement Layer → Recipient
```

**The sender never selects technical infrastructure.**

---

## 3. Payment Types

Support: **Person-to-Person · Business · Merchant · Salary · Subscription · Invoice · QR · Payment Links ·
Cross-Border · Treasury.**

---

## 4. Universal Payment Identity

Users can receive payments using — **no need to share blockchain addresses:** **@username · QR code · phone
alias (optional) · email alias (optional) · ENS (where supported) · a universal payment link.**

---

## 5. Universal QR

One QR supports **BTC · SOL · any supported EVM asset** — the wallet detects the asset and network
automatically.

---

## 6. Payment Links

Generate links such as:

> `pay.intent/@waquar`  or  `pay.intent/invoice/INV-20391`

Recipients complete payment through the supported wallet experience.

---

## 7. Smart Payment Routing

The sender has **BTC**; the recipient wants **USDC on Base.** The wallet automatically **BTC → Swap → Bridge
→ Deliver USDC** (via the Liquidity Engine, Chapter 13) — and both users see a **simple payment experience.**

---

## 8. Merchant Mode

A merchant dashboard — **no blockchain expertise required:** today's sales · pending payments · refunds ·
settlements · customer history · analytics.

---

## 9. Point of Sale (POS)

The merchant enters **₹850**; the customer scans a QR; the wallet handles **asset selection · conversion ·
settlement · confirmation** — and a **receipt is generated automatically.**

---

## 10. Salary Engine

A business pays employees: **payroll → the wallet converts treasury assets if required → employees receive
their preferred asset → payment reports generated.**

---

## 11. Subscription Engine

> Netflix → monthly → USDC · Cloud service → quarterly → BTC equivalent

Users **control renewal permissions** (a bounded, revocable mandate — Chapter 14).

---

## 12. Invoice Engine

Generate invoices containing: **invoice number · merchant · amount · currency · due date · QR · payment link ·
payment status.**

---

## 13. Recurring Payments

**Rent · insurance · salary · utility bills · membership.** Users receive **reminders** or enable
**automation** according to their preferences.

---

## 14. Payment Status

Every payment follows — users always know the current state:

**Created → Waiting → Processing → Broadcast → Settlement → Delivered → Confirmed.**

---

## 15. Payment Receipts

Each exportable receipt includes: **sender · recipient · amount · currency · estimated fees · time ·
transaction reference · status · notes (optional).**

---

## 16. Cross-Border Payments

The user sends **₹50,000**; the recipient chooses **USDC · ETH · BTC · SOL** — the wallet performs the
required conversions and settlement automatically.

---

## 17. AI Payment Assistant

Users can say — the AI converts natural language into structured payment workflows: *Pay Rahul ₹10,000. ·
Split dinner with friends. · Pay my monthly rent. · Send salary to employees.*

---

## 18. Refund Engine

Where technically possible and appropriate, merchants can initiate refunds through the wallet. The system
records: **original payment · refund amount · refund status · reference.**

---

## 19. Business Dashboard

Businesses can view: **revenue · customer growth · refund rate · average payment size · settlement time ·
payment success rate.**

---

## 20. Compliance Layer

The architecture should allow **optional, modular** integrations for regions that require **identity
verification · transaction monitoring · audit records · regulatory reporting** — supporting different
jurisdictions without changing the non-custodial core.

---

## 21. Payment Analytics

Track — to help users understand their activity: **daily volume · monthly volume · largest payments · most
used assets · most used recipients · average settlement time.**

---

## 22. Future Expansion

Support future capabilities such as: **NFC payments · wearable payments · IoT payments · tokenized invoices ·
offline payment preparation · enterprise ERP integrations · AI-assisted payment approvals.**

---

## 23. Definition of Done

The Universal Payment Network is complete when users can:

- **pay anyone** using a username or QR code;
- **send value across supported chains** without understanding blockchain mechanics;
- **receive clear receipts and status updates**;
- support **personal, business, and merchant** payment scenarios from one wallet.

---

## What Chapter 16 commits us to

- **"Who do you want to pay?" — nothing else.** Chain, token, gas, and bridge are the wallet's arithmetic,
  never the sender's decision.
- **A payment is an intent** — it takes the same gate + device signature as a manual send; a scanned QR, a
  link, a subscription, or a remittance is always a *proposal* the user approves.
- **Non-custodial, always** — funds move wallet-to-wallet; no platform account ever holds them, unlike
  custodial payment apps. "Received" means settled on-chain.
- **Honest receipts and status** — every payment shows recipient, amount, and fee before signing, and its
  true state after; a queued or pending payment is never shown as delivered.
- **Compliance is modular and at the edge** — optional per-jurisdiction integrations and a third-party fiat
  ramp keep the core wallet non-custodial and KYC-free.

The buildable detail — and the honest shipped-vs-roadmap split (send/receive/QR/ENS are shipped; merchant,
POS, salary, subscriptions, invoices, cross-border product, refunds, the business dashboard, compliance
integrations, and analytics are roadmap) — is the
[Universal Payment Network Reference](../product/payment-network-reference.md) (Volume II).

---

### 📖 Chapter 17 Preview — DeFi Operating System

Transform the wallet into a unified interface for decentralized finance — making complex DeFi feel as simple
as a modern banking app while keeping users informed about risk and in full control. It will define a
**universal DeFi dashboard**, **lending & borrowing**, **staking management**, **yield optimization**,
**liquidity-pool management**, **perpetuals & derivatives integration**, an **AI DeFi advisor**, **position
health monitoring**, **liquidation-risk alerts**, **one-click strategy execution**, and **unified DeFi
analytics.**

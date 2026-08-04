# docs/security — Volume VII — Security Bible

> Assume real funds and a real adversary.
>
> Part of the **[Founder Bible](../../FOUNDER_BIBLE.md)**. Canonical root doc: [`SECURITY.md`](../../SECURITY.md)
> (which holds the **Principal Security Engineer's veto**). This volume never claims a control it does not run.

## Written

- ✅ [`security-trust-reference.md`](security-trust-reference.md) — **The Security & Trust Engine Reference**
  (~24k words): the buildable expansion of [Chapter 10](../bible/chapter-10-security-trust-engine.md) — the
  threat model · transaction simulation · contract/scam/phishing detection · wallet reputation & address
  verification · approval management · the risk engine & score · behavioral anomaly detection · device &
  session security · emergency/recovery & explainable risk reports. **Every control tagged ✅ shipped /
  🔶 partial / ⏭ roadmap.** Grounded in `packages/risk` + `policy` + `chains/guard.ts`.
- [`wallet-core-threat-model.md`](wallet-core-threat-model.md) — the device-engine threat model (keys,
  signing, encrypted backup).

_Honesty is the point: overclaiming a security control is the worst failure this volume can commit
(Doctrine §3). Keys never leave the device · the AI never signs · guards fail closed._

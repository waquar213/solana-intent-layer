# Chapter 7 — Success Metrics & the North Star

*Why the one number that governs this company is a real person moving real money by talking to it — and why every other number either feeds that one, guards it, or is refused on purpose.*

**Chapter abstract.** A company becomes what it measures. Choose the wrong number and no amount of discipline elsewhere will save you: the wrong metric quietly rewrites the product around itself, one well-intentioned optimization at a time, until you have shipped something you never meant to build. This chapter fixes the one number we steer by — **Real Intents Executed (RIE)**: a natural-language request that ended in an on-chain-confirmed state change signed by the user's own keys — and argues that it is the only honest north star for a wallet whose entire promise is *talk to your money and never be lied to.* It explains why we deliberately reject the numbers the rest of the industry worships (daily actives, total value locked, transaction volume, and — most pointedly — "AI autonomy rate," which for us is an anti-goal, not a KPI). It builds the **metric tree** beneath the star as a funnel of earned trust: activation → first real intent → repeat → cross-ecosystem depth, each leading indicator a lever on the one that matters. It names the **guardrails** — loss events, mis-executions, mislabels, key exposure, lies shown — that hold a hard veto over growth, so that no rise in RIE can ever purchase a regression in safety or honesty. It restates the honesty rule as it applies to our own scoreboard: **we publish no traction number we have not earned**, because a metric is a claim about reality, and an unearned claim would itself break the Doctrine. And it lays a **milestone ladder** made of evidence gates, not calendar dates — the falsifiable finish lines from first external mainnet intent to seed-clearing depth. It closes with what all of this locks in.

---

## 7.1 · One number, honestly chosen — Real Intents Executed

Every company has a number it cannot lie to itself about, the one that survives the all-hands and the board deck and the 2 a.m. argument. For most consumer software that number is engagement — some flavor of daily actives, session length, or retention curve — because for most consumer software the product *is* attention, and attention is the thing being sold. A wallet is not that kind of product. A wallet is a tool you pick up to accomplish a specific, consequential thing with your own money and then, ideally, put back down. Measuring it by attention would be measuring a hammer by how long people hold it. The number has to be the *outcome*, not the *dwell.*

So we choose exactly one:

> **Real Intents Executed (RIE)** — the count of natural-language intents that resulted in an **on-chain-confirmed** state change **signed by the user's own keys.**

Read that definition slowly, because every clause is doing load-bearing work, and each clause is there to make the number impossible to fake without doing the actual thing. *Natural-language intent* means it started as a sentence the user said in their own words — the wedge journey, not a hand-assembled transaction in a fallback form. *On-chain-confirmed* means a real node accepted it and it reached finality — a plan that was drafted but never signed does not count, a simulation does not count, an optimistic "success" toast rendered before confirmation does not count. *State change* means value actually moved or a position actually changed. *Signed by the user's own keys* means the disposition of funds happened where the Doctrine says it must — on the device, by the user, never by the AI and never by a server. A single RIE is therefore a complete, un-fudgeable proof that the whole thesis worked once: a real person expressed a goal in plain English, our deterministic gate proved a route safe, and their own device moved their own money to the outcome they intended.

That un-fakeability is the entire reason we chose it. Crypto is a field littered with numbers that look like traction and are not — Total Value Locked that is one mercenary whale away from evaporating, transaction counts inflated by wash trades and bots, "users" who are airdrop-farming sybils. RIE resists every one of those inflation tricks by construction. You cannot RIE a wash trade into existence without a real user signing a real intent on a real device against a real balance. You cannot borrow a demo number for it, because a testnet transaction mislabelled as mainnet is, by the definition, *not* a real intent — it is a labelled lie, which our own guardrails count against us (§7.4). The metric was designed the way the security engine was designed: assume an adversary, including our own future selves under deadline pressure, and admit only what is positively verified.

There is a deeper reason a wallet needs a single outcome metric rather than a dashboard of proxies. In a category where the first drained user is an extinction event, the failure mode of a proxy metric is not merely inaccuracy — it is *misdirection toward harm.* Optimize "activations" and you are tempted to rush people past the confirm sheet; optimize "swaps completed" and you are tempted to hide the fee that would have made someone reconsider. RIE cannot be goosed that way, because it increments only when a real person got the real outcome *they* intended — which means the honest path and the metric-maximizing path are the same path. That alignment is the property we selected for: the north star of a wallet must be a number that gets *worse* when you cheat the user, not better.

---

## 7.2 · The metrics we refuse — vanity, and the formal anti-metrics

Choosing one number to worship is only half the discipline. The other half is naming, out loud and in the constitution, the numbers we will *not* chase — because the seductive ones are seductive precisely because they are easy to move, and easy to move usually means easy to fake or easy to corrupt. `PRODUCT.md` §9.4 holds the canonical anti-metric list; this section makes the argument for why each is a trap rather than a target.

| Tempting number | Why it seduces | Why it corrupts the product | Our stance |
|---|---|---|---|
| **Raw DAU / session length** | It's the universal SaaS scoreboard; it always goes up if you nag hard enough | Engagement-for-its-own-sake is the seedbed of every dark pattern; a wallet is a tool, not a feed | A user who trusts us, does the thing, and *leaves* is a success |
| **Total Value Locked** | The crypto vanity metric; big number, easy headline | Measures deposited capital, not delivered outcomes; one whale's exit erases it; invites yield-farm mechanics we've outlawed | Not a goal; we ship no token or farm to inflate it |
| **Transaction volume** | Looks like usage; directly maps to fee revenue | Churning value to book fees is extraction dressed as growth; volume divorced from user benefit is a fireable strategy | Refused; volume matters only as it reflects real user benefit |
| **Chains supported / features shipped** | Countable, demoable, competitively legible | Vanity breadth; a chain we can't price, simulate, and risk-check honestly is a liability shipped as a checkbox | Honest depth beats dishonest breadth; chains added only when *honestly* supported |
| **AI autonomy rate** ("% of actions taken without confirmation") | The AI-native pitch: "look how much it does for you" | It is an **anti-goal.** Authorization depth is the user's to grant, never a KPI to grow; optimizing it means engineering away the confirmation that keeps funds safe | We measure it to *bound* it, never to grow it |

The last row deserves its own paragraph, because it is where we part most sharply from the AI-native entrants we compete with. It is tempting — genuinely tempting, in a category racing to look most magical — to advertise how much your agent does on the user's behalf, to treat "the wallet did it for you, no clicks" as the headline feature and its rate as the number to grow. We refuse that framing at the level of the constitution. Our AI has **no signing authority, by construction** (Doctrine 2); automation is bounded by explicit, user-set caps that fail safe — the guard holds a mainnet spend cap and auto-execution, off by default, binds a per-transaction and a daily cap and falls back to manual confirmation whenever a value is unknown or a cap would be exceeded (`SECURITY.md` §5). "Automation depth equals authorization depth" is a product law (`PRODUCT.md` §2.8). A metric that rewarded us for acting *more* without confirmation would be a metric that rewarded us for eroding the exact boundary that makes the product safe. So we do track autonomy — as a *guardrail to watch*, an audit surface — but never as a growth target. Growing it is not the goal; honoring the user's granted authorization exactly, no more and no less, is.

There is a unifying principle beneath every refusal on that list. Each rejected number is easy to move by making the product *worse for the user* — nagging them, locking their capital, churning their value, shipping un-vetted surfaces, or acting beyond what they authorized. RIE is the opposite: it moves only when the product got *better* for the user. We refuse the vanity metrics not out of asceticism but out of self-defense, because a company becomes what it measures, and we have decided what we intend to become.

---

## 7.3 · The metric tree — what feeds the star

A single north star with nothing beneath it is a slogan, not a system. You cannot A/B-test your way toward "Real Intents Executed" directly; it is a lagging outcome, the sum of a hundred earlier moments going right. So beneath the star sits a **metric tree** — a small set of leading indicators, each of which is a lever a team can actually pull, and each of which, when it moves, moves the star. The tree is a funnel of *earned trust*, read top to bottom as the arc of a real user's relationship with us.

```
                          ★ Real Intents Executed (RIE)
                                      ▲
        ┌─────────────────┬──────────┴──────────┬────────────────────┐
   Activation        First real intent      Repeat            Cross-ecosystem depth
 (time-to-first-     (parse→plan→sign→     (retained          (a user who intends
  intent, median)     confirm, once)        intenders,         across BTC · EVM · SOL,
                                            wk-over-wk)         not just one)
        ▲                    ▲                    ▲                     ▲
   Parse accuracy     Plan honesty &      Intent success        Structural reach
   Clarify-not-guess   clarity;            rate (executed/       actually exercised
                       Plan→Sign           attempted)
                       conversion
```

Walk it as a story, with the three people this whole Bible serves.

**Activation — time-to-first-intent.** The clock starts the moment Naya, the capable newcomer, opens the app for the first time, and stops the moment she completes her first real intent. This is the single most honest onboarding metric we have, because it measures the *whole* first-run experience — wallet creation, funding, understanding the confirm sheet, and getting an outcome — as one number, and it is un-gameable in the direction that matters: you cannot shorten it by lying, only by genuinely removing friction. The launch plan sets it as a **written goal** trending downward across the beta (`ROADMAP.md` §3.5) — a target with a date, not a claim of achievement; §7.5 is unambiguous that this document asserts no achieved value. Beneath activation sits **parse accuracy** and the **clarify-not-guess rate**: the fast-path and the schema-forced LLM must understand Naya's sentence, and when they cannot, they must ask a plain question rather than proceed on a guess (a guess about someone's money is the worst thing we can produce, `PRODUCT.md` §9). A rising clarify rate on ambiguous input is a *healthy* signal, not a failure — it is the product refusing to be confidently wrong.

**First real intent.** The activation clock stops here, at the first RIE — but the leading indicators beneath this node are where the trust is actually won or lost. **Plan honesty and clarity** is the degree to which the plan we showed matched the outcome that occurred: the fiat-first total presented before commit ("Total cost: $21.30 (1.01%)"), the slippage the user set, the risk verdict shown loudly. **Plan→Sign conversion** — the share of plans shown that the user chose to sign — is its companion, and it is a subtle metric we read *carefully*: we want it high because the plans are honest and clear, never high because we buried the fee or shamed the user out of cancelling. A confirm sheet that converts because it lies is a metric we would rather see fall. This is the Rabby lesson taken to its conclusion: safety and honesty are features you can measure, and the measurement only counts if the user could have walked away informed.

**Repeat — retained intenders.** Riya, the multi-chain user we won by removing a ceremony she hated, comes back next week and does it again. **Retained intenders** — users with at least one RIE, measured week over week — is the metric that separates a novelty from a habit. It is where a wallet's real value compounds, and it cannot be faked by acquisition spend: a farmed sybil does not come back to sign a second real intent with real funds against a real balance. Retention of *intenders specifically* (not "openers," not "sign-ins") is the honest cut, because it counts only people who kept getting real outcomes.

**Cross-ecosystem depth.** The deepest node, and the one that proves the moat is real rather than rhetorical: a user who intends *across* ecosystems — moving between Bitcoin, the EVM world, and Solana under one identity — rather than living on a single chain. This is the structural reach (three derivation paths off one seed) actually being *exercised*, not merely offered. It is the signal that we are being used for the one sentence only we can honestly say, and it is honestly gated today: the full cross-ecosystem mainnet route is roadmap (V3.1), so at launch this node is measured first on testnets and the guarded, capped mainnet ETH path, and deepens as caps and chains widen on evidence (`ROADMAP.md` §4.3). We measure the depth we have honestly shipped, and we say which is which.

The tree is not a bureaucracy of KPIs; it is a diagnostic instrument. When RIE stalls, you do not stare at the star — you walk down the tree and find the node that broke. Parse accuracy dropped? The front door jammed. Plan→Sign fell while honesty held? The confirm sheet got confusing. Retention slid? We won a task but not a habit. Each leading indicator is a place a team can stand and push, and the discipline of the tree is that pushing any of them, honestly, pushes the only number that ultimately matters.

---

## 7.4 · The guardrails — the metrics that can veto growth

A north star with only accelerators beneath it is a machine with a throttle and no brakes, and for a wallet that is a design for eventual catastrophe. Some numbers exist not to be maximized but to be *held at a floor*, and they carry something no growth metric ever does: a **veto.** If a change grows RIE but worsens a guardrail, it does not ship. The date moves; the guardrail does not. This is the metric-level expression of "bottom-up for trust" — trust is the product, and these are the numbers that measure whether we still have it.

| Guardrail | What it counts | Target | Class |
|---|---|---|---|
| **Funds-stranded rate** | Multi-step intents where funds were left un-recovered and unlocated | → **0** | Hard |
| **Honesty defects** | Any fake/borrowed data, network-fail rendered as `$0`, or UI for a non-existent feature | → **0** | Hard |
| **Key-exposure incidents** | Any path where key/seed material could leave the device | → **0** | Absolute |
| **Mislabel incidents** | Testnet shown as mainnet, capped shown as uncapped, or the reverse | → **0** | Hard |
| **AI-disposed-funds incidents** | Any execution not gated by the device signature | → **0** | Absolute |
| **p95 interaction latency** | Time to first meaningful response on the intent surface | **< 100 ms** | Budget |
| **Accessibility conformance** | WCAG AA across the core journeys, light + dark | maintained | Bar |

The distinction between **hard** and **absolute** is deliberate and worth stating plainly. A hard guardrail targets zero and treats any nonzero reading as a shipping blocker to be driven back down. An *absolute* guardrail — key exposure, AI disposing of funds — is a different category entirely: it is not a number we tolerate at low levels and work to reduce, it is an invariant whose first violation is an architectural failure, not a metric miss. There is no acceptable rate of "the AI moved money without a device signature." One is a catastrophe. These two do not have a budget; they have a wall.

Notice what the guardrails encode: they are the Doctrine rendered as measurements. "Never fake data" becomes the honesty-defect count. "Non-custodial, absolutely" becomes key-exposure. "AI proposes, the signature disposes" becomes AI-disposed-funds. "Apple-grade craft and WCAG AA are acceptance criteria" become the latency budget and the accessibility bar. A guardrail is what a principle looks like when you make it falsifiable — and making the Doctrine falsifiable is the whole point, because a principle you cannot fail is a principle you cannot be trusted to keep.

The veto is not rhetorical. `ROADMAP.md` §1.6 and §6 state it as a scheduling law with teeth: a milestone that grows the north star but regresses a guardrail does not ship, and the launch KPI table lists loss-of-funds incidents with a single value across every checkpoint — **0 — non-negotiable.** The most important number on our scoreboard is a number we intend to keep at zero forever, and we would rather ship late, ship narrow, or not ship at all than let it move. That is what it means to say the guardrails have veto over growth: when a deadline presses against a guardrail, the pressure loses.

---

## 7.5 · The honesty rule — we publish no number we have not earned

Here is where this chapter turns its own instrument on itself. A metric is not a neutral fact; it is a *claim about reality* — and this company has a Doctrine law about claims. Law #3 forbids fake data, borrowed demo numbers, and unearned assertions, and it does not exempt the scoreboard. A traction number we have not earned is not a marketing optimism; it is a lie of exactly the kind we have built the entire product to refuse. Publishing "10,000 users" before there are ten thousand users would be the same category of act as rendering a network failure as `$0` or labelling a testnet transaction "mainnet." The honesty doctrine applies most stringently to the numbers we would most like to be big.

So this chapter states, flatly, **no achieved KPI value.** It cannot, without violating the law it exists to uphold. What it states instead are *definitions* and *priority* — what each number means and which ones win when they conflict — so that no team can quietly redefine success to flatter a bad quarter. The live values live in the analytics surface and, as forward-looking commitments, in the roadmap's KPI dashboard; this chapter owns their meaning, not their current magnitude.

And the roadmap's numbers, in turn, are labelled for exactly what they are: **written goals with a date, never asserted as achieved.** When `ROADMAP.md` §3.5 sets Weekly Real Intents Executed at targets of 60, 350, and 1,300 across the three beta sprints, or activation at 40, 250, and 800 users, or time-to-first-intent trending under ten, six, and four minutes, those are *goals we have committed to on a calendar* — the shape of the ambition — not a report of what has occurred. The difference between "our Day-90 goal is 1,300 real intents a week" and "we do 1,300 real intents a week" is the difference between honesty and fraud, and we will keep that difference visible in every deck, every slide, and every sentence.

This extends to the most honest number we have today, which is a set of zeros. Traction, right now, is *none* — no users, no store listings, no token — and that is **pre-launch by design**, stated plainly in `ROADMAP.md` §2. We do not dress a pre-launch zero as an early-traction anything. Stating a launch narrative that assumed an optimistic audit-pass date, or an activation curve we had not produced, would itself be the dishonesty we have outlawed. Our honest position, before the beta cohort has moved its first real funds, is that the hard part — a non-custodial, multi-chain, AI-intent wallet that genuinely signs and broadcasts — is *built and demonstrable*, and the traction is *zero and honestly labelled zero.* We would rather be believed than impressive. In a category taught by years of inflated dashboards and rug-pulls to distrust every number it is shown, a company whose metrics can be trusted is not merely compliant — it is differentiated. Honesty is the brand, and the scoreboard is not exempt.

---

## 7.6 · The milestone ladder — evidence gates, not dates

The last thing a north star needs is a ladder — a sequence of falsifiable finish lines that turn "grow RIE" from an aspiration into a set of checkable events. Ours are deliberately **evidence gates, not calendar dates**, because a date is a forecast and a gate is a contract; in a category where the cost of shipping early is a drained user, we bind ourselves to evidence and let the dates follow. Every rung below is un-fakeable in the same way the north star is: it requires a funded wallet, a successful parse, a passed safety gate, and a real broadcast (`ROADMAP.md` §6).

| Rung | The falsifiable definition | The guardrail that gates it |
|---|---|---|
| **M-α · First external mainnet RIE** | A beta user — not the team — signs and confirms a real, capped mainnet intent on the frozen launch chain-set | Zero loss-of-funds; capped, and labelled capped |
| **M-β · Beta activation** | A cohort has each executed ≥ 1 real intent (a Day-90 *goal*, not a claim) | Time-to-first-intent trending ↓; honesty defects = 0 |
| **M-γ · WRIE at launch** | Weekly real intents at the launch target (a written goal with a date) | Loss-of-funds = 0; no mislabelling |
| **M-δ · Six-month depth** | Full mainnet coverage across BTC / EVM ERC-20 + swaps / Solana; first self-custody users at depth | Each cap tier cleared on evidence; re-audit of the swap-settlement surface |
| **M-ε · Twelve-month metrics** | Retained intenders and WRIE growth that clear a seed round at a real step-up | All guardrails green year-round |

The ladder makes the abstract sequencing law concrete. **M-α** is the first moment the whole thesis is proven *by a stranger* — not by a founder demo, but by a person who is not us signing real value and getting the outcome they intended. It is gated, non-negotiably, by zero loss-of-funds and an honest "capped" label; a first external mainnet intent that stranded funds or hid its cap would not advance the ladder, it would halt it. Each subsequent rung inherits the gate beneath it: **M-δ**'s widening of caps and chains is unlocked only by clean real intents at the prior tier with zero loss, and by a re-audit of the swap-settlement surface — breadth is a *reward for proven safety*, never a growth tactic (`ROADMAP.md` §4.3). The pacing item behind the entire ladder is the independent security audit: no uncapped, real-fund public launch happens until an external firm reviews key management, signing, and the encrypted backup, and every high and critical finding is fixed and re-tested (`SECURITY.md` §10). The ladder schedules *around* that gate; it does not schedule *through* it.

And the guardrails from §7.4 hold veto over every rung: a milestone that grew RIE while regressing loss-of-funds, honesty defects, key-exposure, mislabelling, or AI-disposed-funds does not count as climbed, however large the north-star number beside it. This is the final expression of the chapter's whole argument. The north star tells us where to go, the tree tells us how to get there, the anti-metrics tell us which shortcuts are traps, the guardrails tell us what we may never trade away to arrive, and the ladder tells us that arrival is proven by evidence a skeptic could check — not asserted, not borrowed, not dated into existence. A stranger moving real money by talking to their wallet, and never once being lied to. That is the only finish line that counts.

---

## What this chapter commits us to

- **One north star: Real Intents Executed.** A real user, a real on-chain-confirmed outcome, signed by their own keys. It is the only number we steer by because it is the only one impossible to fake without doing the actual thing. Every other metric feeds it, guards it, or is refused.
- **We refuse the vanity metrics, by name.** Not raw DAU or session length, not TVL, not transaction volume, not chains-supported as a vanity count. **AI autonomy rate is an anti-goal**, tracked only to bound it — never a KPI to grow — because authorization depth is the user's to grant, never ours to inflate.
- **The metric tree is a funnel of earned trust.** Activation → first real intent → repeat → cross-ecosystem depth, each with leading indicators (parse accuracy, plan honesty, plan→sign conversion, intent success) that a team can honestly push. Plan→Sign that rises by lying is a metric we would rather see fall.
- **The guardrails hold a hard veto over growth.** Funds-stranded, honesty defects, mislabels → 0 (hard); key-exposure and AI-disposed-funds → 0 (absolute invariants, not budgets); < 100 ms interaction; WCAG AA maintained. A change that grows RIE but regresses a guardrail does not ship — the date moves, the guardrail does not.
- **We publish no number we have not earned.** A metric is a claim about reality; an unearned one breaks Doctrine law #3. This chapter asserts no achieved KPI value; the roadmap's targets are written goals with a date; today's traction is honestly zero, pre-launch by design, and we will not dress it as anything else.
- **The ladder is evidence gates, not dates.** First external mainnet intent → beta activation → launch WRIE → six-month depth → seed-clearing metrics, each un-fakeable, each gated by zero loss-of-funds and the independent audit, each subject to the guardrail veto. Breadth is a reward for proven safety, never a growth tactic.

**Bridge to Volume II.** Volume I has argued the *why* — the mission, the vision, the philosophy, the strategy, the moat, the competitors, and now the single number that tells us whether any of it is working. Every metric in this chapter is a promise about a user's actual experience: that they will be activated quickly, told the truth at the confirm sheet, kept safe from stranded funds, and never lied to on the scoreboard or the screen. **Volume II — the Product Bible** is where those promises become surfaces: every screen and every state, every flow and every edge case, the anatomy of the sacred confirm sheet, and the microcopy that makes a first-time stranger comprehend before they sign. The north star told us what to count; the Product Bible builds the thing worth counting.

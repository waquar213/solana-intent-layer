/**
 * The FactLedger — the turn's ground truth. Every figure a tool produces is
 * recorded here as a `CitedFact`; the response may cite ONLY facts that resolve
 * against it. This is the mechanism behind "the AI never fabricates a number":
 * the model can write prose, but any figure it states is checked against a fact
 * the engines actually returned (see verify.ts).
 */
import type { CitedFact } from './types.js';

export class FactLedger {
  private readonly facts = new Map<string, CitedFact>();

  constructor(seed: CitedFact[] = []) {
    this.add(seed);
  }

  add(facts: CitedFact[]): void {
    for (const f of facts) this.facts.set(f.id, f);
  }

  resolve(id: string): CitedFact | undefined {
    return this.facts.get(id);
  }

  all(): CitedFact[] {
    return [...this.facts.values()];
  }
}

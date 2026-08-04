/**
 * Bridge utterance corpus. A bridge is the one action the planner has no intent kind for, so its
 * parsing is easy to rot unnoticed — these cases pin every phrasing that must work, every phrasing
 * that must ASK for a missing amount, and (most importantly) every phrasing that must NOT be
 * mistaken for a bridge.
 *
 * History: the first regex matched only `bridge|deposit` + `giwa` + `N eth`, failing 24 of 45
 * realistic phrasings. The second version fixed the phrasings but still hardcoded ONE route
 * (Sepolia→GIWA, ETH only) even though the wallet's relayer bridges Sepolia ⇄ GIWA ⇄ Solana ⇄
 * Bitcoin in any direction — so "bridge 5 SOL to giwa" was refused as "not a bridge" while the
 * Bridge tab did exactly that. This corpus covers the routes the executor really has.
 */
import { describe, expect, it } from 'vitest';
import { parseBridgeUtterance, type BridgeRoute } from '../src/parse/bridge.js';

const EVM = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
const SOL_ADDR = '4d9dyddpj6a44A1uMhDRBYWNQWVWnNLHNbj65UVpVjzZ';

/** Every phrasing that must yield a concrete amount, across several amount formats. */
const WITH_AMOUNT: string[] = [];
for (const amt of ['0.01', '0.5', '1', '.25']) {
  WITH_AMOUNT.push(
    `bridge ${amt} ETH to GIWA`,
    `deposit ${amt} ETH to GIWA`,
    `bridge ${amt} eth from sepolia to giwa`,
    `move ${amt} ETH to GIWA`,
    `send ${amt} ETH from sepolia to giwa`,
    `transfer ${amt} ETH to giwa network`,
    `bridge ${amt} ETH sepolia to giwa`,
    `deposit ${amt} eth into giwa`,
    `bridge ${amt} ETH to GIWA Sepolia`,
    `top up giwa with ${amt} ETH`,
    `fund my giwa wallet with ${amt} ETH`,
    `l1 to l2 bridge ${amt} ETH`,
    `bridge ${amt} to giwa`, // bare number, asset implied
    `${amt} ETH ko giwa pe bhejo`, // Hinglish
    `${amt} ETH giwa pe daal do`, // Hinglish
    `${amt} ETH를 GIWA로 브릿지`, // Korean
    `GIWA로 ${amt} ETH 보내줘`, // Korean
  );
}

describe('parseBridgeUtterance — amounts', () => {
  for (const u of WITH_AMOUNT) {
    it(`parses "${u}"`, () => {
      const got = parseBridgeUtterance(u);
      expect(got, u).not.toBeNull();
      const amount = (got as BridgeRoute).amount;
      // A leading-dot amount must become 0.x, never x — the same 10x-overspend guard the amount
      // parser applies.
      expect(amount, u).not.toBeNull();
      expect((amount as string).startsWith('.'), u).toBe(false);
      expect(Number(amount)).toBeGreaterThan(0);
    });
  }

  it('reads a leading-dot amount as 0.x', () => {
    expect(parseBridgeUtterance('bridge .25 ETH to GIWA')).toEqual({
      fromId: 'sepolia',
      toId: 'giwa',
      asset: 'ETH',
      amount: '0.25',
    });
  });
});

/**
 * Routes beyond the original Sepolia→GIWA deposit. Each one is a route `BRIDGE_CHAINS` + the
 * relayer already execute from the Bridge tab, so refusing them in chat was a parser gap, not a
 * capability gap.
 */
describe('parseBridgeUtterance — all three chains, both directions', () => {
  const ROUTES: [string, Partial<BridgeRoute>][] = [
    // GIWA → Sepolia (the reverse of the flagship deposit)
    ['bridge 0.05 ETH from giwa to sepolia', { fromId: 'giwa', toId: 'sepolia', asset: 'ETH', amount: '0.05' }],
    ['move 0.05 ETH giwa to sepolia', { fromId: 'giwa', toId: 'sepolia', asset: 'ETH' }],
    ['withdraw 0.05 from giwa', { fromId: 'giwa', toId: 'sepolia', asset: 'ETH', amount: '0.05' }],
    ['bridge 0.1 eth l2 to l1', { fromId: 'giwa', toId: 'sepolia', asset: 'ETH', amount: '0.1' }],
    // Solana ⇄ GIWA
    ['bridge 5 SOL to giwa', { fromId: 'solana', toId: 'giwa', asset: 'SOL', amount: '5' }],
    ['bridge 0.5 sol from solana to giwa', { fromId: 'solana', toId: 'giwa', asset: 'SOL', amount: '0.5' }],
    ['bridge 0.02 ETH from giwa to solana', { fromId: 'giwa', toId: 'solana', asset: 'ETH', amount: '0.02' }],
    ['0.5 SOL ko giwa pe bhejo', { fromId: 'solana', toId: 'giwa', asset: 'SOL', amount: '0.5' }],
    // Solana ⇄ Sepolia
    ['bridge 1 SOL to sepolia', { fromId: 'solana', toId: 'sepolia', asset: 'SOL', amount: '1' }],
    ['bridge 0.01 ETH from sepolia to solana', { fromId: 'sepolia', toId: 'solana', asset: 'ETH', amount: '0.01' }],
    // Bitcoin, which BRIDGE_CHAINS also wires
    ['bridge 0.001 BTC to giwa', { fromId: 'bitcoin', toId: 'giwa', asset: 'BTC', amount: '0.001' }],
    ['bridge 0.02 ETH from giwa to bitcoin', { fromId: 'giwa', toId: 'bitcoin', asset: 'ETH', amount: '0.02' }],
  ];
  for (const [u, want] of ROUTES) {
    it(`routes "${u}"`, () => {
      expect(parseBridgeUtterance(u), u).toMatchObject(want);
    });
  }
});

describe('parseBridgeUtterance — an explicit bridge KEEPS a named recipient', () => {
  // Dropping a stated address is how a wallet sends funds somewhere the user never asked for, so an
  // explicit "bridge … to <addr>" must carry it through rather than quietly bridging to self.
  it('carries an EVM recipient', () => {
    expect(parseBridgeUtterance(`bridge 0.01 ETH to giwa to ${EVM}`)).toMatchObject({
      fromId: 'sepolia',
      toId: 'giwa',
      recipient: EVM,
    });
  });
  it('carries a Solana recipient without reading it as a chain name', () => {
    expect(parseBridgeUtterance(`bridge 0.02 ETH from giwa to solana ${SOL_ADDR}`)).toMatchObject({
      fromId: 'giwa',
      toId: 'solana',
      asset: 'ETH',
      recipient: SOL_ADDR,
    });
  });
});

describe('parseBridgeUtterance — asks instead of failing', () => {
  // The route is unambiguous but the amount is missing. `amount: null` lets the UI ask; the first
  // parser returned null, which fell through to "I couldn't understand that".
  for (const u of ['bridge ETH to GIWA', 'bridge to giwa', 'deposit eth into giwa', 'top up my giwa balance', 'GIWA로 브릿지']) {
    it(`asks for the amount on "${u}"`, () => {
      const got = parseBridgeUtterance(u);
      expect(got, u).not.toBeNull();
      expect((got as BridgeRoute).amount, u).toBeNull();
      expect((got as BridgeRoute).toId, u).toBe('giwa');
    });
  }
});

describe('parseBridgeUtterance — must NOT claim these', () => {
  const NOT_BRIDGE = [
    // A concrete recipient with an AMBIGUOUS verb is an ordinary transfer, even when GIWA is named —
    // sends already settle on GIWA, so claiming these would route funds through the wrong flow.
    `send 0.5 ETH to ${EVM} on giwa`,
    'send 1 ETH to alice.eth on giwa',
    'pay 0.1 ETH to bob.eth on giwa',
    // Only each chain's NATIVE asset crosses the bridge.
    'bridge 100 USDC to giwa',
    'move 10 USDT to giwa',
    'bridge 0.1 WBTC to giwa', // must not be read as BTC
    'bridge 50 gUSDC to solana',
    'bridge 20 dUSDC to sepolia',
    // An asset that cannot leave the named source.
    'bridge 5 SOL from sepolia to giwa',
    // A destination the wallet does not bridge to.
    'bridge 0.1 ETH to arbitrum',
    'bridge my USDC to arbitrum',
    // Same chain on both ends — no route.
    'bridge 1 SOL to solana',
    'bridge 0.1 ETH from giwa to giwa',
    // Not a bridge at all.
    'swap 1 ETH for USDC',
    'send 0.001 ETH',
    'stake 1 ETH',
    // A chain named with no moving verb.
    'what is giwa',
    'giwa balance',
    'how does giwa work',
  ];
  for (const u of NOT_BRIDGE) {
    it(`ignores "${u}"`, () => {
      expect(parseBridgeUtterance(u), u).toBeNull();
    });
  }
});

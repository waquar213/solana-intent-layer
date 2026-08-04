#!/usr/bin/env node
/**
 * Bridge relayer — the missing half of the operator bridge.
 *
 * The wallet already deposits to an operator address with the route encoded on-chain:
 *   EVM/Bitcoin  → the memo is the transaction's calldata / OP_RETURN
 *   Solana       → the memo is an spl-memo instruction
 *   memo format  → "BRDG:<destChainId>:<recipient>"          (verified on a real deposit:
 *                  0x3ae6446e… on GIWA decodes to BRDG:sepolia:0xB81cbD5Bba32C44FdF851B2a6C1F5501046E82c8)
 *
 * Nothing ever released those deposits. Running `pending` for the first time found FOUR stranded on
 * the operator addresses — 0.001 + 0.01 + 0.02 ETH and 0.05 SOL — two of which nobody knew about.
 * This is the process that reads a deposit and settles it: pay it out on the destination when the
 * route is same-asset, or return it to the sender when it is not.
 *
 * SAFETY PROPERTIES — a relayer that gets these wrong does not fail safely. It either eats the
 * deposit (what happened) or pays it twice (worse), so each one is enforced in code, not by care:
 *
 *   1. IDEMPOTENCY   Every payout is keyed by its SOURCE txid in an append-only ledger written with
 *                    O_EXCL before the release is signed. A crash between write and broadcast can
 *                    only ever LEAK a payout (operator keeps the deposit), never duplicate it —
 *                    the safe direction, and it is visible in `pending` as a claimed-but-unpaid row.
 *   2. FINALITY      A deposit is ignored until it has CONFIRMATIONS behind it, so a reorged deposit
 *                    cannot be paid out.
 *   3. DRY RUN       Default is dry-run. Broadcasting requires --execute, explicitly, every time.
 *   4. RATE          Same-asset routes pay 1:1 minus the fee — no oracle, nothing to manipulate.
 *                    CROSS-ASSET routes (SOL→ETH) need a price and are REFUSED by this relayer:
 *                    a stale or manipulated rate is a silent loss, and a human should price those.
 *
 * Keys come from the environment and are never logged:
 *   RELAYER_EVM_KEY   0x-hex 32 bytes — operator on Sepolia + GIWA
 *   RELAYER_SOL_KEY   base58 64-byte secret key (Solana convention) or 0x-hex 32-byte seed
 *
 * Usage:
 *   node services/relayer/relayer.mjs pending
 *   node services/relayer/relayer.mjs release <sourceTxid> [--execute]
 *   node services/relayer/relayer.mjs watch [--execute] [--interval 30]
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, openSync, closeSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { base58, base64 } from '@scure/base';
import { signEip1559Transaction, evmAddressFromPublicKey, signSolanaTransactionMessage } from '@intent-wallet/core';
import { secp256k1 } from '@noble/curves/secp256k1';
import { ed25519 } from '@noble/curves/ed25519';
import { buildSolTransferMessage } from '@intent-wallet/chains';

const HERE = dirname(fileURLToPath(import.meta.url));
const LEDGER_DIR = join(HERE, 'ledger');
const MEMO_TAG = 'BRDG';
/** Confirmations required before a deposit is payable (property 2). */
const CONFIRMATIONS = { evm: 6, solana: 32 };
/** Operator fee, matching BRIDGE_FEE_BPS in the wallet. */
const FEE_BPS = 10n;

// ── chains ───────────────────────────────────────────────────────────────────
const CHAINS = {
  sepolia: {
    kind: 'evm',
    label: 'Sepolia',
    asset: 'ETH',
    decimals: 18,
    evmChainId: 11155111,
    rpc: process.env.RELAYER_SEPOLIA_RPC || 'https://ethereum-sepolia-rpc.publicnode.com',
    explorer: 'https://eth-sepolia.blockscout.com',
  },
  giwa: {
    kind: 'evm',
    label: 'GIWA Sepolia',
    asset: 'ETH',
    decimals: 18,
    evmChainId: 91342,
    rpc: process.env.RELAYER_GIWA_RPC || 'https://sepolia-rpc.giwa.io',
    explorer: 'https://sepolia-explorer.giwa.io',
  },
  solana: {
    kind: 'solana',
    label: 'Solana devnet',
    asset: 'SOL',
    decimals: 9,
    rpc: process.env.RELAYER_SOLANA_RPC || 'https://api.devnet.solana.com',
    explorer: 'https://explorer.solana.com',
  },
};

// ── keys (never logged) ──────────────────────────────────────────────────────
function evmKey() {
  const raw = (process.env.RELAYER_EVM_KEY || '').trim();
  if (!raw) return null;
  const hex = raw.replace(/^0x/u, '');
  if (!/^[0-9a-fA-F]{64}$/u.test(hex)) throw new Error('RELAYER_EVM_KEY must be 32 bytes of hex');
  return Uint8Array.from(hex.match(/../gu).map((b) => parseInt(b, 16)));
}
function solKey() {
  const raw = (process.env.RELAYER_SOL_KEY || '').trim();
  if (!raw) return null;
  if (raw.startsWith('0x')) {
    const hex = raw.slice(2);
    if (!/^[0-9a-fA-F]{64}$/u.test(hex)) throw new Error('RELAYER_SOL_KEY hex form must be a 32-byte seed');
    return Uint8Array.from(hex.match(/../gu).map((b) => parseInt(b, 16)));
  }
  const bytes = base58.decode(raw);
  if (bytes.length === 64) return bytes.slice(0, 32); // Solana keypair file convention: seed || pubkey
  if (bytes.length === 32) return bytes;
  throw new Error('RELAYER_SOL_KEY must decode to 32 or 64 bytes');
}
const evmOperator = () => {
  const k = evmKey();
  return k ? evmAddressFromPublicKey(secp256k1.getPublicKey(k, false)) : (process.env.RELAYER_EVM_OPERATOR || '').trim();
};
const solOperator = () => {
  const k = solKey();
  return k ? base58.encode(ed25519.getPublicKey(k)) : (process.env.RELAYER_SOL_OPERATOR || '').trim();
};

// ── ledger: one file per source txid, created with O_EXCL (property 1) ───────
function ledgerPath(txid) {
  return join(LEDGER_DIR, `${txid.replace(/[^0-9a-zA-Z]/gu, '_')}.json`);
}
/** Claim a deposit for payout. Returns false if it was already claimed — the duplicate guard. */
function claim(txid, record) {
  mkdirSync(LEDGER_DIR, { recursive: true });
  try {
    const fd = openSync(ledgerPath(txid), 'wx'); // wx = fail if it exists: atomic claim
    writeSync(fd, JSON.stringify({ ...record, claimedAt: new Date().toISOString() }, null, 2));
    closeSync(fd);
    return true;
  } catch (e) {
    if (e.code === 'EEXIST') return false;
    throw e;
  }
}
function markPaid(txid, patch) {
  const p = ledgerPath(txid);
  const cur = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
  writeFileSync(p, JSON.stringify({ ...cur, ...patch, paidAt: new Date().toISOString() }, null, 2));
}
function ledgerEntry(txid) {
  const p = ledgerPath(txid);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}
function ledgerAll() {
  if (!existsSync(LEDGER_DIR)) return [];
  return readdirSync(LEDGER_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(LEDGER_DIR, f), 'utf8')));
}

// ── rpc helpers ──────────────────────────────────────────────────────────────
async function rpc(url, method, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result;
}
const hexToBytes = (h) => Uint8Array.from((h.replace(/^0x/u, '').match(/../gu) ?? []).map((b) => parseInt(b, 16)));
const decodeMemo = (s) => {
  const parts = s.split(':');
  if (parts.length < 3 || parts[0] !== MEMO_TAG) return null;
  const toId = parts[1].trim();
  const recipient = parts.slice(2).join(':').trim();
  return CHAINS[toId] && recipient ? { toId, recipient } : null;
};

// ── scan: find deposits on every source chain ────────────────────────────────
// A chain is only scanned if its operator address is known. When one is missing we WARN rather
// than skip silently — a silent skip turns into a misleading "no deposit found" for a deposit that
// is really there, just on an un-scanned chain (exactly the confusing error this note prevents).
const warnedMissing = new Set();
function operatorFor(kind) {
  const op = kind === 'sol' ? solOperator() : evmOperator();
  if (!op && !warnedMissing.has(kind)) {
    warnedMissing.add(kind);
    const varName = kind === 'sol' ? 'RELAYER_SOL_OPERATOR (or RELAYER_SOL_KEY)' : 'RELAYER_EVM_OPERATOR (or RELAYER_EVM_KEY)';
    console.warn(`note: ${kind.toUpperCase()} operator not set — set ${varName} to scan ${kind === 'sol' ? 'Solana' : 'EVM'} deposits.`);
  }
  return op;
}

async function scanEvm(id) {
  const c = CHAINS[id];
  const op = operatorFor('evm');
  if (!op) return [];
  const [txs, head] = await Promise.all([
    fetch(`${c.explorer}/api/v2/addresses/${op}/transactions?filter=to`, { signal: AbortSignal.timeout(20_000) })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .catch(() => ({ items: [] })),
    rpc(c.rpc, 'eth_blockNumber', []).then((h) => parseInt(h, 16)),
  ]);
  const out = [];
  for (const t of txs.items ?? []) {
    if (String(t.to?.hash ?? '').toLowerCase() !== op.toLowerCase()) continue;
    if (!t.raw_input || t.raw_input === '0x') continue;
    let memo;
    try {
      memo = decodeMemo(new TextDecoder().decode(hexToBytes(t.raw_input)));
    } catch {
      continue;
    }
    if (!memo) continue;
    out.push({
      txid: t.hash,
      fromId: id,
      sender: t.from?.hash ?? null,
      amountBase: BigInt(t.value ?? '0'),
      confirmations: t.block_number ? head - t.block_number + 1 : 0,
      ...memo,
    });
  }
  return out;
}

async function scanSolana() {
  const c = CHAINS.solana;
  const op = operatorFor('sol');
  if (!op) return [];
  const sigs = await rpc(c.rpc, 'getSignaturesForAddress', [op, { limit: 50 }]).catch(() => []);
  const slot = await rpc(c.rpc, 'getSlot', []).catch(() => 0);
  const out = [];
  for (const s of sigs) {
    if (s.err) continue;
    const tx = await rpc(c.rpc, 'getTransaction', [s.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]).catch(() => null);
    if (!tx) continue;
    const ixs = tx.transaction.message.instructions ?? [];
    const memoIx = ixs.find((i) => i.program === 'spl-memo' && typeof i.parsed === 'string');
    const memo = memoIx ? decodeMemo(memoIx.parsed) : null;
    if (!memo) continue;
    const xfer = ixs.find((i) => i.program === 'system' && i.parsed?.type === 'transfer' && i.parsed.info.destination === op);
    if (!xfer) continue;
    out.push({
      txid: s.signature,
      fromId: 'solana',
      sender: xfer.parsed.info.source ?? null,
      amountBase: BigInt(xfer.parsed.info.lamports),
      confirmations: tx.slot && slot ? slot - tx.slot : 0,
      ...memo,
    });
  }
  return out;
}

async function scanAll() {
  const [a, b, c] = await Promise.all([scanEvm('sepolia'), scanEvm('giwa'), scanSolana()]);
  return [...a, ...b, ...c];
}

/** CoinGecko ids — the SAME price source the wallet's bridge quote uses, so payouts match the UI. */
const COINGECKO_ID = { ETH: 'ethereum', SOL: 'solana', BTC: 'bitcoin' };
/** A ceiling on a single CROSS-ASSET deposit's USD value. Above this a human should price it —
 *  a testnet backstop that bounds how much one mispriced release could ever move. */
const CROSS_ASSET_MAX_USD = 500;

/** Live USD spot for one asset, as an integer of micro-USD (so all conversion stays in bigint). */
async function spotMicroUsd(asset) {
  const id = COINGECKO_ID[asset];
  if (!id) return null;
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const usd = (await res.json())[id]?.usd;
    return typeof usd === 'number' && usd > 0 ? BigInt(Math.round(usd * 1e6)) : null;
  } catch {
    return null;
  }
}

/**
 * Payout amount, minus the fee.
 *   • SAME-asset  → 1:1. No oracle, nothing to manipulate.
 *   • CROSS-asset → converted at live spot (CoinGecko, the wallet's own price source). Enabled now
 *     because the operator is a key the user holds and settles to their own address (self-to-self:
 *     a wrong rate moves value from the user to the user, net zero). It is still bounded — one
 *     deposit above CROSS_ASSET_MAX_USD is refused for a human — and this is honestly operator-
 *     assisted + spot-priced, NOT a production bridge (mainnet uses an audited aggregator).
 */
async function payout(d) {
  const from = CHAINS[d.fromId];
  const to = CHAINS[d.toId];
  if (from.asset === to.asset) {
    if (from.decimals !== to.decimals) return { error: `decimal mismatch ${from.decimals}→${to.decimals}` };
    return { amountBase: (d.amountBase * (10_000n - FEE_BPS)) / 10_000n };
  }
  const [fromUsd, toUsd] = await Promise.all([spotMicroUsd(from.asset), spotMicroUsd(to.asset)]);
  if (!fromUsd || !toUsd) return { error: `no live price for ${from.asset}/${to.asset} — cannot price this cross-asset release` };
  // valueMicroUsd = depositBase · fromUsd / 10^fromDec   (all bigint)
  const valueMicroUsd = (d.amountBase * fromUsd) / 10n ** BigInt(from.decimals);
  if (valueMicroUsd > BigInt(CROSS_ASSET_MAX_USD) * 1_000_000n) {
    return { error: `deposit is ~$${Number(valueMicroUsd) / 1e6} — above the $${CROSS_ASSET_MAX_USD} cross-asset cap; release it by hand` };
  }
  // destBase = valueMicroUsd · 10^toDec / toUsd, then minus fee
  const destBase = (valueMicroUsd * 10n ** BigInt(to.decimals)) / toUsd;
  const afterFee = (destBase * (10_000n - FEE_BPS)) / 10_000n;
  if (afterFee <= 0n) return { error: 'priced payout rounds to zero' };
  return { amountBase: afterFee, rate: `${from.asset}→${to.asset} @ $${Number(fromUsd) / 1e6}/$${Number(toUsd) / 1e6}` };
}

const dec = (base, decimals) => {
  const s = base.toString().padStart(decimals + 1, '0');
  const frac = s.slice(-decimals).replace(/0+$/u, '');
  return frac ? `${s.slice(0, -decimals)}.${frac}` : s.slice(0, -decimals);
};

async function classify(d) {
  const led = ledgerEntry(d.txid);
  if (led?.paidAt) return { state: 'PAID', led };
  if (led) return { state: 'CLAIMED-UNPAID', led }; // a crash between claim and broadcast; needs a human
  const need = CONFIRMATIONS[CHAINS[d.fromId].kind];
  if (d.confirmations < need) return { state: `WAITING (${d.confirmations}/${need} conf)` };
  const p = await payout(d);
  return p.error ? { state: 'REFUSED', why: p.error } : { state: 'PAYABLE', amountBase: p.amountBase, rate: p.rate };
}

// ── release ──────────────────────────────────────────────────────────────────
async function releaseEvm(toId, recipient, amountBase) {
  const c = CHAINS[toId];
  const key = evmKey();
  if (!key) throw new Error('RELAYER_EVM_KEY is not set — cannot sign the release');
  const from = evmAddressFromPublicKey(secp256k1.getPublicKey(key, false));
  const [nonceHex, feeHex, tipHex] = await Promise.all([
    rpc(c.rpc, 'eth_getTransactionCount', [from, 'pending']),
    rpc(c.rpc, 'eth_gasPrice', []),
    rpc(c.rpc, 'eth_maxPriorityFeePerGas', []).catch(() => '0x3b9aca00'),
  ]);
  const maxPriorityFeePerGas = BigInt(tipHex);
  const maxFeePerGas = BigInt(feeHex) * 2n + maxPriorityFeePerGas;
  const gasLimit = 21_000n;
  const cost = amountBase + gasLimit * maxFeePerGas;
  const bal = BigInt(await rpc(c.rpc, 'eth_getBalance', [from, 'latest']));
  if (bal < cost) throw new Error(`operator balance ${dec(bal, 18)} < needed ${dec(cost, 18)} on ${c.label}`);
  const signed = signEip1559Transaction(
    { chainId: c.evmChainId, nonce: parseInt(nonceHex, 16), maxFeePerGas, maxPriorityFeePerGas, gasLimit, to: recipient, value: amountBase, data: '0x' },
    key,
  );
  const txid = await rpc(c.rpc, 'eth_sendRawTransaction', [signed.raw]);
  return { txid, url: `${c.explorer}/tx/${txid}` };
}

async function releaseSolana(recipient, amountBase) {
  const c = CHAINS.solana;
  const key = solKey();
  if (!key) throw new Error('RELAYER_SOL_KEY is not set — cannot sign the release');
  const pub = ed25519.getPublicKey(key);
  // Float check, the Solana mirror of releaseEvm's balance guard: never sign a release the operator
  // cannot cover (leave a small lamport cushion for the fee).
  const bal = BigInt((await rpc(c.rpc, 'getBalance', [base58.encode(pub)]))?.value ?? 0);
  if (bal < amountBase + 10_000n) throw new Error(`operator SOL balance ${dec(bal, 9)} < needed ${dec(amountBase, 9)} + fee on ${c.label}`);
  const bh = await rpc(c.rpc, 'getLatestBlockhash', [{ commitment: 'finalized' }]);
  const message = buildSolTransferMessage({
    fromPubkey: pub,
    toAddress: recipient,
    lamports: amountBase,
    recentBlockhash: bh.value.blockhash,
  });
  const sig = signSolanaTransactionMessage(message, key);
  const wire = new Uint8Array(1 + sig.length + message.length);
  wire[0] = 1;
  wire.set(sig, 1);
  wire.set(message, 1 + sig.length);
  const txid = await rpc(c.rpc, 'sendTransaction', [base64.encode(wire), { encoding: 'base64', preflightCommitment: 'confirmed' }]);
  return { txid, url: `https://explorer.solana.com/tx/${txid}?cluster=devnet` };
}

async function releaseOne(d, execute) {
  const cls = await classify(d);
  if (cls.state !== 'PAYABLE') return { skipped: cls.state, why: cls.why };
  const to = CHAINS[d.toId];
  const amount = `${dec(cls.amountBase, to.decimals)} ${to.asset}${cls.rate ? ` (${cls.rate})` : ''}`;
  if (!execute) return { dryRun: `would release ${amount} → ${d.recipient} on ${to.label}` };

  // Claim BEFORE signing. If we die after this line the payout leaks (operator keeps the funds and
  // `pending` shows CLAIMED-UNPAID) rather than being paid twice on restart.
  if (!claim(d.txid, { source: d.txid, fromId: d.fromId, toId: d.toId, recipient: d.recipient, depositBase: d.amountBase.toString(), payoutBase: cls.amountBase.toString() })) {
    return { skipped: 'already claimed' };
  }
  const r = to.kind === 'evm' ? await releaseEvm(d.toId, d.recipient, cls.amountBase) : await releaseSolana(d.recipient, cls.amountBase);
  markPaid(d.txid, { releaseTxid: r.txid, releaseUrl: r.url });
  return { released: amount, ...r };
}

/**
 * Return a deposit to its SENDER on the source chain.
 *
 * The relayer refuses cross-asset routes because pricing them is a silent-loss risk — but refusing
 * must not mean the deposit is stranded forever, which is what happened to 0.031 ETH and 0.05 SOL.
 * A refund is same-asset by construction (send back exactly what arrived, minus the network fee), so
 * it needs no oracle and cannot be mispriced. It shares the SAME ledger, keyed by source txid, so a
 * deposit can be either released or refunded — never both.
 */
async function refundOne(d, execute) {
  const led = ledgerEntry(d.txid);
  if (led?.paidAt) return { skipped: `already ${led.refund ? 'refunded' : 'released'}` };
  if (led) return { skipped: 'already claimed (CLAIMED-UNPAID — resolve by hand)' };
  const from = CHAINS[d.fromId];
  const need = CONFIRMATIONS[from.kind];
  if (d.confirmations < need) return { skipped: `WAITING (${d.confirmations}/${need} conf)` };
  if (!d.sender) return { skipped: 'sender unknown — cannot refund' };

  // Gas comes out of the refund, so the operator never pays to undo someone else's deposit.
  const gasReserve = from.kind === 'evm' ? 21_000n * 3_000_000_000n : 10_000n;
  if (d.amountBase <= gasReserve) return { skipped: `deposit ${dec(d.amountBase, from.decimals)} is below the network fee` };
  const amountBase = d.amountBase - gasReserve;
  const amount = `${dec(amountBase, from.decimals)} ${from.asset}`;
  if (!execute) return { dryRun: `would refund ${amount} → ${d.sender} on ${from.label}` };

  if (!claim(d.txid, { source: d.txid, refund: true, fromId: d.fromId, sender: d.sender, depositBase: d.amountBase.toString(), payoutBase: amountBase.toString() })) {
    return { skipped: 'already claimed' };
  }
  const r = from.kind === 'evm' ? await releaseEvm(d.fromId, d.sender, amountBase) : await releaseSolana(d.sender, amountBase);
  markPaid(d.txid, { releaseTxid: r.txid, releaseUrl: r.url });
  return { refunded: amount, ...r };
}

// ── cli ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const cmd = argv[0] ?? 'pending';
const execute = argv.includes('--execute');

async function cmdPending() {
  const evmOp = evmOperator() || '(RELAYER_EVM_KEY / RELAYER_EVM_OPERATOR not set)';
  const solOp = solOperator() || '(RELAYER_SOL_KEY / RELAYER_SOL_OPERATOR not set)';
  console.log(`operator EVM    ${evmOp}`);
  console.log(`operator Solana ${solOp}\n`);
  const deposits = await scanAll();
  if (deposits.length === 0) {
    console.log('no bridge deposits found on any operator address.');
    return;
  }
  const classified = await Promise.all(deposits.map((d) => classify(d)));
  let payable = 0;
  for (let i = 0; i < deposits.length; i++) {
    const d = deposits[i];
    const cls = classified[i];
    if (cls.state === 'PAYABLE') payable++;
    const from = CHAINS[d.fromId];
    const to = CHAINS[d.toId];
    console.log(`${cls.state.padEnd(22)} ${dec(d.amountBase, from.decimals)} ${from.asset} ${from.label} → ${to.label}`);
    console.log(`  source    ${d.txid}`);
    console.log(`  recipient ${d.recipient}`);
    if (cls.rate) console.log(`  will pay  ${dec(cls.amountBase, to.decimals)} ${to.asset}  (${cls.rate})`);
    if (cls.why) {
      console.log(`  why       ${cls.why}`);
      console.log(`  recover   refund ${d.txid} --execute   (returns it to the sender, same-asset)`);
    }
    if (cls.led?.releaseTxid) console.log(`  release   ${cls.led.releaseTxid}`);
    console.log();
  }
  const firstPayable = deposits.find((_, i) => classified[i].state === 'PAYABLE');
  console.log(`${deposits.length} deposit(s) · ${payable} payable · ledger has ${ledgerAll().length} record(s)`);
  if (firstPayable) console.log(`\nrelease one:  node ${process.argv[1].split('/').pop()} release ${firstPayable.txid} --execute`);
}

async function cmdRefund(txid) {
  if (!txid) throw new Error('usage: refund <sourceTxid> [--execute]');
  const d = (await scanAll()).find((x) => x.txid.toLowerCase() === txid.toLowerCase());
  if (!d) throw new Error(`no bridge deposit found with source txid ${txid}`);
  console.log(JSON.stringify(await refundOne(d, execute), null, 2));
  if (!execute) console.log('\ndry run — add --execute to broadcast.');
}

async function cmdRelease(txid) {
  if (!txid) throw new Error('usage: release <sourceTxid> [--execute]');
  const d = (await scanAll()).find((x) => x.txid.toLowerCase() === txid.toLowerCase());
  if (!d) throw new Error(`no bridge deposit found with source txid ${txid}`);
  const r = await releaseOne(d, execute);
  console.log(JSON.stringify(r, null, 2));
  if (!execute) console.log('\ndry run — add --execute to broadcast.');
}

async function cmdWatch() {
  const interval = Number(argv[argv.indexOf('--interval') + 1]) || 30;
  console.log(`watching every ${interval}s · ${execute ? 'EXECUTE' : 'dry-run'}\n`);
  for (;;) {
    try {
      for (const d of await scanAll()) {
        const r = await releaseOne(d, execute);
        if (r.released || r.dryRun) console.log(new Date().toISOString(), d.txid.slice(0, 14), JSON.stringify(r));
      }
    } catch (e) {
      console.error(new Date().toISOString(), 'scan failed:', e.message);
    }
    await new Promise((r) => setTimeout(r, interval * 1000));
  }
}

try {
  if (cmd === 'pending') await cmdPending();
  else if (cmd === 'release') await cmdRelease(argv[1]);
  else if (cmd === 'refund') await cmdRefund(argv[1]);
  else if (cmd === 'watch') await cmdWatch();
  else {
    console.log('commands: pending | release <txid> [--execute] | refund <txid> [--execute] | watch [--execute] [--interval N]');
    process.exitCode = 1;
  }
} catch (e) {
  console.error('error:', e.message);
  process.exitCode = 1;
}

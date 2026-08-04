import { describe, expect, it } from 'vitest';
import { ContactBook } from '../src/contacts.js';

const EVM = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
const EVM_LOWER = '0x9858effd232b4033e47d90003d41ec34ecaeda94';
const BTC = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';

describe('ContactBook', () => {
  it('adds, lists, renames, and removes contacts', async () => {
    const book = new ContactBook();
    const rahul = await book.add({ name: 'Rahul', address: EVM });
    expect(rahul.ecosystem).toBe('evm');
    expect(rahul.verified).toBe(false);
    await book.add({ name: 'Cold Wallet', address: BTC });

    const list = await book.list();
    expect(list.map((c) => c.name)).toEqual(['Cold Wallet', 'Rahul']); // sorted

    const renamed = await book.rename(rahul.id, 'Rahul K');
    expect(renamed.name).toBe('Rahul K');

    await book.remove(rahul.id);
    expect(await book.list()).toHaveLength(1);
  });

  it('dedupes by address regardless of EVM checksum casing', async () => {
    const book = new ContactBook();
    await book.add({ name: 'Rahul', address: EVM });
    await expect(book.add({ name: 'Rahul Again', address: EVM_LOWER })).rejects.toThrowError(
      expect.objectContaining({ code: 'DUPLICATE_CONTACT' }),
    );
  });

  it('validates the address and the name', async () => {
    const book = new ContactBook();
    await expect(book.add({ name: 'X', address: 'not-an-address' })).rejects.toThrowError(
      expect.objectContaining({ code: 'INVALID_ADDRESS' }),
    );
    await expect(book.add({ name: '', address: EVM })).rejects.toThrowError(
      expect.objectContaining({ code: 'INVALID_CONTACT' }),
    );
  });

  it('marks a contact verified after a send', async () => {
    const book = new ContactBook();
    const c = await book.add({ name: 'Maa', address: EVM });
    expect((await book.markVerified(c.id)).verified).toBe(true);
  });
});

describe('resolveRecipient', () => {
  it('resolves a raw valid address, enriching with a known contact', async () => {
    const book = new ContactBook();
    await book.add({ name: 'Rahul', address: EVM });
    const byAddr = await book.resolveRecipient(EVM_LOWER);
    expect(byAddr).toMatchObject({ kind: 'address', ecosystem: 'evm' });
    if (byAddr.kind === 'address') expect(byAddr.contact?.name).toBe('Rahul');

    const unknown = await book.resolveRecipient(BTC);
    expect(unknown).toMatchObject({ kind: 'address', ecosystem: 'btc' });
    if (unknown.kind === 'address') expect(unknown.contact).toBeUndefined();
  });

  it('resolves a unique contact name (case-insensitive)', async () => {
    const book = new ContactBook();
    await book.add({ name: 'Rahul', address: EVM });
    const r = await book.resolveRecipient('rahul');
    expect(r.kind).toBe('contact');
    if (r.kind === 'contact') expect(r.contact.address).toBe(EVM);
  });

  it('flags ambiguity when multiple contacts share a name — never guesses', async () => {
    const book = new ContactBook();
    await book.add({ name: 'Rahul', address: EVM });
    await book.add({ name: 'Rahul', address: BTC });
    const r = await book.resolveRecipient('Rahul');
    expect(r.kind).toBe('ambiguous');
    if (r.kind === 'ambiguous') expect(r.candidates).toHaveLength(2);
  });

  it('returns not_found for an unknown name', async () => {
    const book = new ContactBook();
    const r = await book.resolveRecipient('Nobody');
    expect(r).toMatchObject({ kind: 'not_found', query: 'Nobody' });
  });
});

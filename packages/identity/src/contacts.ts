/**
 * Contacts / address book. Turns "send $100 to Rahul" into a concrete,
 * validated address — the resolution the Intent Engine depends on. Contacts are
 * keyed by their (ecosystem, normalized address) so the same address can't be
 * saved twice; a contact gains a `verified` marker once the user has
 * successfully sent to it (a soft anti-mistake signal shown in the UI).
 *
 * Storage is an injected async interface: on-device the app backs it with the
 * SecureStore/local DB; nothing here assumes a network or a clock.
 */
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@intent-wallet/core';
import { classifyAddress, addressesEqual, type Ecosystem } from './address.js';
import { IdentityError } from './errors.js';

export interface Contact {
  id: string;
  name: string;
  address: string;
  ecosystem: Ecosystem;
  /** True once the user has successfully sent to this address. */
  verified: boolean;
}

export interface NewContact {
  name: string;
  address: string;
}

/** Async persistence for contacts. In-memory impl provided for tests/dev. */
export interface ContactStore {
  list(): Promise<Contact[]>;
  put(contact: Contact): Promise<void>;
  delete(id: string): Promise<void>;
}

export class InMemoryContactStore implements ContactStore {
  readonly #map = new Map<string, Contact>();
  async list(): Promise<Contact[]> {
    return [...this.#map.values()];
  }
  async put(contact: Contact): Promise<void> {
    this.#map.set(contact.id, contact);
  }
  async delete(id: string): Promise<void> {
    this.#map.delete(id);
  }
}

export type RecipientResolution =
  | { kind: 'address'; ecosystem: Ecosystem; address: string; contact?: Contact }
  | { kind: 'contact'; contact: Contact }
  | { kind: 'ambiguous'; candidates: Contact[] }
  | { kind: 'not_found'; query: string };

/** Deterministic contact id from its identity-defining fields (dedupe by address). */
function contactId(ecosystem: Ecosystem, normalizedAddress: string): string {
  return bytesToHex(sha256(utf8ToBytes(`${ecosystem}:${normalizedAddress}`))).slice(0, 24);
}

export class ContactBook {
  readonly #store: ContactStore;

  constructor(store: ContactStore = new InMemoryContactStore()) {
    this.#store = store;
  }

  /** Adds a contact after validating the address. Throws on bad address or duplicate. */
  async add(input: NewContact): Promise<Contact> {
    const name = input.name.trim();
    if (name.length === 0 || name.length > 50) {
      throw new IdentityError('INVALID_CONTACT', 'contact name must be 1–50 characters');
    }
    const info = classifyAddress(input.address);
    if (!info) throw new IdentityError('INVALID_ADDRESS', 'contact address is not a valid blockchain address');

    const id = contactId(info.ecosystem, info.normalized);
    const existing = await this.#store.list();
    if (existing.some((c) => c.id === id)) {
      throw new IdentityError('DUPLICATE_CONTACT', 'this address is already in your contacts');
    }
    const contact: Contact = { id, name, address: info.normalized, ecosystem: info.ecosystem, verified: false };
    await this.#store.put(contact);
    return contact;
  }

  async rename(id: string, name: string): Promise<Contact> {
    const contact = await this.#get(id);
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > 50) {
      throw new IdentityError('INVALID_CONTACT', 'contact name must be 1–50 characters');
    }
    const updated = { ...contact, name: trimmed };
    await this.#store.put(updated);
    return updated;
  }

  /** Marks a contact verified after a successful send to it. */
  async markVerified(id: string): Promise<Contact> {
    const contact = await this.#get(id);
    const updated = { ...contact, verified: true };
    await this.#store.put(updated);
    return updated;
  }

  async remove(id: string): Promise<void> {
    await this.#store.delete(id);
  }

  async list(): Promise<Contact[]> {
    return (await this.#store.list()).sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Resolves a recipient query into something sendable. Order: a valid address
   * wins (and is enriched with a matching contact if we know it); otherwise we
   * match contacts by name — exactly one → contact, several → ambiguous, none →
   * not found. Never guesses among multiple people with the same name.
   */
  async resolveRecipient(query: string): Promise<RecipientResolution> {
    const trimmed = query.trim();
    const info = classifyAddress(trimmed);
    if (info) {
      const known = (await this.#store.list()).find((c) => addressesEqual(c.address, info.normalized));
      return known
        ? { kind: 'address', ecosystem: info.ecosystem, address: info.normalized, contact: known }
        : { kind: 'address', ecosystem: info.ecosystem, address: info.normalized };
    }
    const matches = (await this.#store.list()).filter((c) => c.name.toLowerCase() === trimmed.toLowerCase());
    if (matches.length === 1) return { kind: 'contact', contact: matches[0] as Contact };
    if (matches.length > 1) return { kind: 'ambiguous', candidates: matches };
    return { kind: 'not_found', query: trimmed };
  }

  async #get(id: string): Promise<Contact> {
    const contact = (await this.#store.list()).find((c) => c.id === id);
    if (!contact) throw new IdentityError('RECIPIENT_NOT_FOUND', 'contact not found');
    return contact;
  }
}

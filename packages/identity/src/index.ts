/**
 * @intent-wallet/identity — the Universal Identity Engine. Sits above the
 * wallet core; makes chains invisible by presenting one identity (three receive
 * addresses) and resolving human recipient queries into validated addresses.
 * The permanent foundation the Intent Engine, AI layer, and Portfolio build on.
 */
export { IdentityError, isIdentityError, type IdentityErrorCode } from './errors.js';
export {
  classifyAddress,
  isValidAddress,
  requireAddress,
  addressesEqual,
  type Ecosystem,
  type Network,
  type AddressInfo,
} from './address.js';
export {
  deriveUniversalIdentity,
  computeIdentityId,
  getReceiveAddresses,
  type UniversalIdentity,
  type ReceiveAddress,
  type IdentityMetadata,
} from './identity.js';
export {
  ContactBook,
  InMemoryContactStore,
  type Contact,
  type NewContact,
  type ContactStore,
  type RecipientResolution,
} from './contacts.js';

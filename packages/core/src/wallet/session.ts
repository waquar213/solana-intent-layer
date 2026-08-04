/**
 * SessionManager — the auto-lock timer and unlocked/locked state.
 *
 * Purely about timing and state; it holds no key material. The WalletManager
 * owns the keyring and wires this: `start()` on unlock, `touch()` on user
 * activity, and the `onLock` callback fires when the idle timeout elapses so
 * the WalletManager can destroy the keyring. Timers are injectable so tests are
 * deterministic (no real clocks).
 */
export interface Scheduler {
  setTimer(callback: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

const defaultScheduler: Scheduler = {
  setTimer: (cb, ms) => setTimeout(cb, ms),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface SessionOptions {
  /** Idle timeout before auto-lock, in ms. 0 disables auto-lock. Default 5 min. */
  autoLockMs?: number;
  scheduler?: Scheduler;
}

export class SessionManager {
  #autoLockMs: number;
  readonly #scheduler: Scheduler;
  readonly #onLock: () => void;
  #handle: unknown = null;
  #active = false;

  constructor(onLock: () => void, options: SessionOptions = {}) {
    this.#onLock = onLock;
    this.#autoLockMs = options.autoLockMs ?? 5 * 60_000;
    this.#scheduler = options.scheduler ?? defaultScheduler;
  }

  get active(): boolean {
    return this.#active;
  }

  /** Begins a session and arms the auto-lock timer. */
  start(): void {
    this.#active = true;
    this.#arm();
  }

  /** Resets the idle timer (call on user activity). No-op if inactive. */
  touch(): void {
    if (this.#active) this.#arm();
  }

  /** Update the idle timeout (e.g. re-read from settings on unlock). Re-arms immediately with the
   *  new value if a session is already active; 0 disables auto-lock. */
  setAutoLockMs(ms: number): void {
    this.#autoLockMs = ms;
    if (this.#active) this.#arm();
  }

  /** Ends the session and cancels the timer. Idempotent. */
  stop(): void {
    this.#active = false;
    this.#cancel();
  }

  #arm(): void {
    this.#cancel();
    if (this.#autoLockMs <= 0) return; // auto-lock disabled
    this.#handle = this.#scheduler.setTimer(() => {
      if (!this.#active) return;
      this.#active = false;
      this.#handle = null;
      this.#onLock();
    }, this.#autoLockMs);
  }

  #cancel(): void {
    if (this.#handle !== null) {
      this.#scheduler.clearTimer(this.#handle);
      this.#handle = null;
    }
  }
}

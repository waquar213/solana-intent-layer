import { describe, expect, it } from 'vitest';
import { SessionManager, type Scheduler } from '../src/wallet/session.js';

/** A controllable scheduler: `fire()` runs the pending timer callback. */
function fakeScheduler() {
  let pending: { cb: () => void; ms: number } | null = null;
  let nextHandle = 1;
  const scheduler: Scheduler = {
    setTimer(cb, ms) {
      pending = { cb, ms };
      return nextHandle++;
    },
    clearTimer() {
      pending = null;
    },
  };
  return {
    scheduler,
    fire: () => {
      const p = pending;
      pending = null;
      p?.cb();
    },
    get armed() {
      return pending !== null;
    },
    get delay() {
      return pending?.ms ?? null;
    },
  };
}

describe('SessionManager', () => {
  it('starts inactive; start() arms the auto-lock timer', () => {
    const sched = fakeScheduler();
    let locked = 0;
    const session = new SessionManager(() => (locked += 1), { autoLockMs: 1000, scheduler: sched.scheduler });
    expect(session.active).toBe(false);
    session.start();
    expect(session.active).toBe(true);
    expect(sched.armed).toBe(true);
    expect(sched.delay).toBe(1000);
  });

  it('fires onLock and deactivates when the idle timer elapses', () => {
    const sched = fakeScheduler();
    let locked = 0;
    const session = new SessionManager(() => (locked += 1), { autoLockMs: 1000, scheduler: sched.scheduler });
    session.start();
    sched.fire();
    expect(locked).toBe(1);
    expect(session.active).toBe(false);
  });

  it('touch() re-arms the timer (keeps an active session alive)', () => {
    const sched = fakeScheduler();
    let locked = 0;
    const session = new SessionManager(() => (locked += 1), { autoLockMs: 1000, scheduler: sched.scheduler });
    session.start();
    session.touch();
    expect(sched.armed).toBe(true);
    expect(locked).toBe(0);
  });

  it('stop() cancels the timer so onLock never fires', () => {
    const sched = fakeScheduler();
    let locked = 0;
    const session = new SessionManager(() => (locked += 1), { autoLockMs: 1000, scheduler: sched.scheduler });
    session.start();
    session.stop();
    expect(session.active).toBe(false);
    expect(sched.armed).toBe(false);
    sched.fire(); // nothing pending
    expect(locked).toBe(0);
  });

  it('touch() on an inactive session is a no-op', () => {
    const sched = fakeScheduler();
    const session = new SessionManager(() => {}, { autoLockMs: 1000, scheduler: sched.scheduler });
    session.touch();
    expect(sched.armed).toBe(false);
  });

  it('autoLockMs=0 disables auto-lock (session stays active)', () => {
    const sched = fakeScheduler();
    let locked = 0;
    const session = new SessionManager(() => (locked += 1), { autoLockMs: 0, scheduler: sched.scheduler });
    session.start();
    expect(session.active).toBe(true);
    expect(sched.armed).toBe(false); // no timer armed
  });
});

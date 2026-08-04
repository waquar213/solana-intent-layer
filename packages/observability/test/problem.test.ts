import { describe, expect, it } from 'vitest';
import { AppError, badRequest, isAppError, notFound } from '../src/errors.js';
import { toAppError, toProblem } from '../src/problem.js';

describe('AppError', () => {
  it('derives sensible default status codes from the code', () => {
    expect(notFound().statusCode).toBe(404);
    expect(badRequest('bad').statusCode).toBe(400);
    expect(new AppError('RATE_LIMITED', 'slow').statusCode).toBe(429);
    expect(new AppError('INTERNAL', 'x').statusCode).toBe(500);
  });

  it('marks 4xx as expected and 5xx as unexpected', () => {
    expect(badRequest('x').expected).toBe(true);
    expect(new AppError('INTERNAL', 'x').expected).toBe(false);
  });
});

describe('toProblem', () => {
  it('exposes message + details for expected (4xx) errors', () => {
    const problem = toProblem(badRequest('email is invalid', { field: 'email' }), { instance: '/v1/x' });
    expect(problem).toMatchObject({
      status: 400,
      code: 'BAD_REQUEST',
      detail: 'email is invalid',
      instance: '/v1/x',
      details: { field: 'email' },
    });
    expect(problem.type).toContain('BAD_REQUEST');
  });

  it('hides internals for unexpected (5xx) errors — never leaks the message', () => {
    const problem = toProblem(new AppError('INTERNAL', 'db password rejected at 10.0.0.5'));
    expect(problem.status).toBe(500);
    expect(problem.detail).toBe('An unexpected error occurred.');
    expect(JSON.stringify(problem)).not.toContain('password');
  });

  it('treats arbitrary thrown values as opaque 500s', () => {
    expect(toProblem('kaboom').status).toBe(500);
    expect(toProblem(new Error('raw with secret token')).detail).toBe('An unexpected error occurred.');
  });
});

describe('toAppError', () => {
  it('passes AppErrors through and wraps everything else as INTERNAL', () => {
    const app = badRequest('x');
    expect(toAppError(app)).toBe(app);
    const wrapped = toAppError(new Error('boom'));
    expect(isAppError(wrapped)).toBe(true);
    expect(wrapped.code).toBe('INTERNAL');
  });
});

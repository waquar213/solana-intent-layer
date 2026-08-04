/**
 * Uniform error handling → RFC 9457 problem+json. Fastify schema-validation
 * errors become 400s; our AppErrors map by their status; anything unexpected is
 * a flattened 500 that never leaks internals (observability.toProblem). Every
 * 5xx is logged at error level with the request context.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AppError, isAppError, toAppError, toProblem, badRequest } from '@intent-wallet/observability';

const PROBLEM_CONTENT_TYPE = 'application/problem+json';

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: unknown, request: FastifyRequest, reply: FastifyReply) => {
    // Fastify attaches `.validation` for schema failures → treat as client error.
    const fastifyValidation = (error as { validation?: unknown }).validation;
    // Fastify CORE errors (empty/malformed JSON → 400, body-too-large → 413, bad media type → 415)
    // carry a numeric `statusCode` but no `.validation`. Without honoring it, toAppError coerces them
    // to INTERNAL/500 — a client mistake reported as a server error, logged at error level, and
    // counted as a 5xx (burning the error budget / firing false alerts). Preserve the real 4xx.
    const rawStatus = (error as { statusCode?: unknown }).statusCode;
    const clientStatus = typeof rawStatus === 'number' && rawStatus >= 400 && rawStatus < 500 ? rawStatus : undefined;
    const appError: AppError = isAppError(error)
      ? error
      : fastifyValidation
        ? badRequest('request failed validation', { validation: fastifyValidation })
        : clientStatus !== undefined
          ? new AppError('BAD_REQUEST', typeof (error as { message?: unknown }).message === 'string' ? (error as { message: string }).message : 'bad request', { statusCode: clientStatus })
          : toAppError(error);

    if (!appError.expected) {
      request.log2?.error('unhandled error', { err: appError });
    } else {
      request.log2?.warn('request rejected', { code: appError.code });
    }

    const problem = toProblem(appError, { instance: request.url });
    void reply.code(problem.status).type(PROBLEM_CONTENT_TYPE).send(problem);
  });

  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    const problem = toProblem(new AppError('NOT_FOUND', `no route for ${request.method} ${request.url}`), {
      instance: request.url,
    });
    void reply.code(404).type(PROBLEM_CONTENT_TYPE).send(problem);
  });
}

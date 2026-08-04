/**
 * Attaches a per-request id and a child logger to every request. The request id
 * is echoed as `x-request-id` and threaded into logs so a request is traceable
 * end-to-end (architecture 01 §3). Accepts an inbound `x-request-id` (trusted
 * only for correlation, never for authz) or generates one.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Logger } from '@intent-wallet/observability';
import { randomBytes, randomUUID } from 'node:crypto';

declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
    /** W3C trace id (32 hex) — correlates this request across services in one trace. */
    traceId: string;
    log2: Logger;
  }
}

const TRACEPARENT = /^\d{2}-([0-9a-f]{32})-[0-9a-f]{16}-\d{2}$/u;

/** Keep an inbound W3C `traceparent` trace id, or mint a fresh one. */
function traceIdFrom(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header;
  const matched = typeof value === 'string' ? TRACEPARENT.exec(value) : null;
  return matched?.[1] ?? randomUUID().replace(/-/gu, '');
}

export function registerRequestContext(app: FastifyInstance, logger: Logger): void {
  app.addHook('onRequest', (request: FastifyRequest, reply: FastifyReply, done: () => void) => {
    const inbound = request.headers['x-request-id'];
    const requestId =
      typeof inbound === 'string' && inbound.length > 0 && inbound.length <= 200 ? inbound : randomUUID();
    // Distributed tracing: preserve an upstream trace id so a request stays ONE
    // trace across services, and stamp it on every log line. A fresh span id is
    // minted for this hop and echoed as `traceparent` for the next service.
    const traceId = traceIdFrom(request.headers['traceparent']);
    const spanId = randomBytes(8).toString('hex');
    request.requestId = requestId;
    request.traceId = traceId;
    request.log2 = logger.child({ requestId, traceId, method: request.method, path: request.url });
    void reply.header('x-request-id', requestId);
    void reply.header('traceparent', `00-${traceId}-${spanId}-01`);
    done();
  });
}

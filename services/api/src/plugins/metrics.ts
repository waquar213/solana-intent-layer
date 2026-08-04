/**
 * Prometheus metrics — the RED signals (Rate, Errors, Duration) every HTTP route
 * emits, plus Node process metrics (heap, GC, event-loop lag). Without these there
 * is no way to see p99 latency, error rate, or an error budget under real traffic.
 *
 * Cardinality is kept low on purpose: the `route` label is the matched ROUTE PATTERN
 * (`/v1/intents/plan`), never the concrete URL — otherwise per-address paths would
 * explode the series count. Each app instance gets its OWN registry so tests don't
 * leak metrics into each other.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export function registerMetrics(app: FastifyInstance): void {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });

  const labelNames = ['method', 'route', 'status'] as const;
  const httpRequests = new Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests by method, route pattern, and status code.',
    labelNames,
    registers: [registry],
  });
  const httpDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds by method, route pattern, and status code.',
    labelNames,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry],
  });

  app.addHook('onResponse', (request: FastifyRequest, reply: FastifyReply, done: () => void) => {
    // The matched pattern, not the concrete URL — bounded cardinality. Unrouted
    // requests (404s) collapse to one series instead of one-per-random-path.
    const route = request.routeOptions?.url ?? '__unrouted__';
    const labels = { method: request.method, route, status: String(reply.statusCode) };
    httpRequests.inc(labels);
    httpDuration.observe(labels, (reply.elapsedTime ?? 0) / 1000);
    done();
  });

  // Scrape endpoint. Public like /healthz (network-policy it in the cluster); it
  // exposes only aggregate counters, never request bodies or identifiers.
  app.get('/metrics', async (_request, reply) => {
    void reply.header('content-type', registry.contentType);
    return registry.metrics();
  });
}

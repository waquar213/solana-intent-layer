/**
 * Liveness and readiness. `/healthz` = "the process is up" (never touches
 * dependencies — used by k8s liveness). `/readyz` = "ready to serve traffic"
 * (checks injected dependency probes — used by k8s readiness so a pod with a
 * dead DB is pulled from rotation without being killed).
 */
import type { FastifyInstance } from 'fastify';

export interface ReadinessProbe {
  name: string;
  check: () => Promise<boolean>;
}

export function registerHealthRoutes(app: FastifyInstance, probes: ReadinessProbe[] = []): void {
  app.get('/healthz', async () => ({ status: 'ok' }));

  app.get('/readyz', async (_request, reply) => {
    const results = await Promise.all(
      probes.map(async (p) => {
        try {
          return { name: p.name, ok: await p.check() };
        } catch {
          return { name: p.name, ok: false };
        }
      }),
    );
    const ready = results.every((r) => r.ok);
    return reply.code(ready ? 200 : 503).send({ status: ready ? 'ready' : 'not_ready', checks: results });
  });
}

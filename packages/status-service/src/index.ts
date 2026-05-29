import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { prisma, redis } from './lib/db';
import log from './lib/logger';
import statusRouter from './routes/status';
import { createStatusRateLimiter } from './middleware/rateLimiter';

// ─── Env validation ───────────────────────────────────────────────────────────
const REQUIRED_ENV = ['DATABASE_URL', 'REDIS_URL', 'JWT_PUBLIC_KEY'];
const missing = REQUIRED_ENV.filter(v => !process.env[v]);
if (missing.length > 0) {
  log.fatal({ missing }, 'Missing required environment variables');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3003;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet());
app.use(express.json());
app.use(pinoHttp({ logger: log }));

app.use((_req, res, next) => {
  res.setHeader('X-Request-ID', crypto.randomUUID());
  next();
});

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/readyz', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await redis.ping();
    res.json({ status: 'ok', service: 'status-service', uptime: Math.floor(process.uptime()) });
  } catch (err) {
    log.error(err, 'Readiness check failed');
    res.status(503).json({ status: 'error' });
  }
});

// ─── Expired status cleanup ───────────────────────────────────────────────────
// Redis TTLs handle live expiry; this prunes DB rows more than 24h past their expiresAt
function scheduleCleanup(): void {
  const run = async () => {
    try {
      const cutoff = new Date(Date.now() - 24 * 3600_000);
      const { count } = await prisma.status.deleteMany({ where: { expiresAt: { lt: cutoff } } });
      if (count > 0) log.info({ count }, 'Pruned expired statuses');
    } catch (err) {
      log.error(err, 'Status cleanup failed');
    }
  };

  setInterval(run, 3600_000);
  run(); // run once at startup to clear any backlog
}

// ─── Start ────────────────────────────────────────────────────────────────────
async function start(): Promise<void> {
  await redis.connect();
  log.info('Redis connected');

  await prisma.$connect();
  log.info('Database connected');

  app.use('/v1/status', createStatusRateLimiter(), statusRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    log.error(err, 'Unhandled error');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  });

  scheduleCleanup();

  const server = app.listen(PORT, () => {
    log.info({ port: PORT }, 'Status service started');
  });

  const shutdown = async () => {
    log.info('Shutting down...');
    server.close(async () => {
      await prisma.$disconnect();
      await redis.disconnect();
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  log.fatal(err, 'Failed to start status service');
  process.exit(1);
});

import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { prisma, redis, redisSub } from './lib/db';
import { getFirebaseApp } from './lib/firebase';
import { startSubscriber } from './lib/subscriber';
import log from './lib/logger';
import notificationsRouter from './routes/notifications';

// ─── Env validation ───────────────────────────────────────────────────────────
const REQUIRED_ENV = ['DATABASE_URL', 'REDIS_URL', 'JWT_PUBLIC_KEY', 'FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
const missing = REQUIRED_ENV.filter(v => !process.env[v]);
if (missing.length > 0) {
  log.fatal({ missing }, 'Missing required environment variables');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3004;

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
    res.json({ status: 'ok', service: 'notification-service', uptime: Math.floor(process.uptime()) });
  } catch (err) {
    log.error(err, 'Readiness check failed');
    res.status(503).json({ status: 'error' });
  }
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/v1/notifications', notificationsRouter);

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
});

// ─── Error handler ────────────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  log.error(err, 'Unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
});

// ─── Start ────────────────────────────────────────────────────────────────────
async function start(): Promise<void> {
  getFirebaseApp();
  log.info('Firebase initialised');

  await redis.connect();
  log.info('Redis connected');

  await redisSub.connect();
  log.info('Redis subscriber connected');

  await prisma.$connect();
  log.info('Database connected');

  await startSubscriber();

  const server = app.listen(PORT, () => {
    log.info({ port: PORT }, 'Notification service started');
  });

  const shutdown = async () => {
    log.info('Shutting down...');
    server.close(async () => {
      await redisSub.disconnect();
      await redis.disconnect();
      await prisma.$disconnect();
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  log.fatal(err, 'Failed to start notification service');
  process.exit(1);
});

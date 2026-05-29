import http from 'http';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { prisma, redisPub, redisSub, redisGroupSub } from './lib/db';
import { createSocketServer } from './lib/socketServer';
import { startStatusSubscriber } from './lib/statusSubscriber';
import log from './lib/logger';

// ─── Env validation ───────────────────────────────────────────────────────────
const REQUIRED_ENV = ['DATABASE_URL', 'REDIS_URL', 'JWT_PUBLIC_KEY'];
const missing = REQUIRED_ENV.filter(v => !process.env[v]);
if (missing.length > 0) {
  log.fatal({ missing }, 'Missing required environment variables');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3005;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet());
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
    await redisPub.ping();
    res.json({ status: 'ok', service: 'websocket-service', uptime: Math.floor(process.uptime()) });
  } catch (err) {
    log.error(err, 'Readiness check failed');
    res.status(503).json({ status: 'error' });
  }
});

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
});

// ─── Start ────────────────────────────────────────────────────────────────────
async function start(): Promise<void> {
  await Promise.all([redisPub.connect(), redisSub.connect(), redisGroupSub.connect()]);
  log.info('Redis connected');

  await prisma.$connect();
  log.info('Database connected');

  const httpServer = http.createServer(app);
  const io = createSocketServer(httpServer);
  await startStatusSubscriber(io);

  httpServer.listen(PORT, () => {
    log.info({ port: PORT }, 'WebSocket service started');
  });

  const shutdown = async () => {
    log.info('Shutting down...');
    io.close(async () => {
      await redisGroupSub.disconnect();
      await redisSub.disconnect();
      await redisPub.disconnect();
      await prisma.$disconnect();
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  log.fatal(err, 'Failed to start websocket service');
  process.exit(1);
});

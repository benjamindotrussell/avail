import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { prisma, redis } from './lib/db';
import log from './lib/logger';
import groupsRouter from './routes/groups';
import { createGroupsRateLimiter } from './middleware/rateLimiter';

// ─── Env validation ───────────────────────────────────────────────────────────
const REQUIRED_ENV = ['DATABASE_URL', 'REDIS_URL', 'JWT_PUBLIC_KEY'];
const missing = REQUIRED_ENV.filter(v => !process.env[v]);
if (missing.length > 0) {
  log.fatal({ missing }, 'Missing required environment variables');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3002;

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
    res.json({ status: 'ok', service: 'groups-service', uptime: Math.floor(process.uptime()) });
  } catch (err) {
    log.error(err, 'Readiness check failed');
    res.status(503).json({ status: 'error' });
  }
});

// ─── Invite web fallback ───────────────────────────────────────────────────────
// Shows a landing page when the app isn't installed; the mobile app handles deep links directly
app.get('/join/:code', async (req, res) => {
  const { code } = req.params;

  const invite = await prisma.inviteLink.findUnique({
    where: { code },
    include: { group: true },
  }).catch(() => null);

  const groupName = (invite && invite.expiresAt > new Date()) ? invite.group.name : null;

  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${groupName ? `Join ${groupName} on Avail` : 'Avail'}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #1C1A2E; color: #F9F7F4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 24px; }
    .card { text-align: center; max-width: 360px; width: 100%; }
    .logo { font-size: 32px; font-weight: 800; color: #FF6B35; margin-bottom: 24px; }
    h1 { font-size: 24px; font-weight: 700; margin-bottom: 8px; }
    p { color: #C4C1BE; font-size: 15px; margin-bottom: 32px; line-height: 1.5; }
    .btn { display: block; background: #FF6B35; color: #fff; text-decoration: none; border-radius: 14px; padding: 16px 24px; font-size: 17px; font-weight: 700; margin-bottom: 12px; }
    .store-links { display: flex; gap: 12px; justify-content: center; }
    .store-links a { color: #C4C1BE; font-size: 13px; }
    .expired { color: #C4C1BE; font-size: 15px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Avail</div>
    ${groupName
      ? `<h1>You're invited to<br>${groupName}</h1>
         <p>See who's free to hang out — no group chat chaos.</p>
         <a class="btn" href="avail://join/${code}">Open in Avail</a>
         <div class="store-links">
           <a href="https://apps.apple.com/app/avail">App Store</a>
           <a href="https://play.google.com/store/apps/avail">Google Play</a>
         </div>`
      : `<p class="expired">This invite link has expired or is invalid.</p>`
    }
  </div>
</body>
</html>`);
});

// ─── Start ────────────────────────────────────────────────────────────────────
async function start(): Promise<void> {
  await redis.connect();
  log.info('Redis connected');

  await prisma.$connect();
  log.info('Database connected');

  app.use('/v1/groups', createGroupsRateLimiter(), groupsRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    log.error(err, 'Unhandled error');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  });

  const server = app.listen(PORT, () => {
    log.info({ port: PORT }, 'Groups service started');
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
  log.fatal(err, 'Failed to start groups service');
  process.exit(1);
});

# Avail — Backend Monorepo

Social availability app backend. Five microservices built with Node.js, TypeScript, PostgreSQL, and Redis.

## Services

| Service | Port | Responsibility |
|---|---|---|
| `auth-service` | 3001 | Sign up, login, JWT, account deletion |
| `groups-service` | 3002 | Groups, members, invite links |
| `status-service` | 3003 | Set/get status, Redis cache, pub/sub fan-out |
| `notification-service` | 3004 | Push notifications, device token management |
| `websocket-service` | 3005 | Socket.io real-time delivery |

## Prerequisites

- Node.js 20+
- Docker and Docker Compose
- AWS CLI (for deployments)

## Local setup

### 1. Clone and install dependencies
```bash
git clone https://github.com/your-org/avail
cd avail
npm install
```

### 2. Set up environment files
```bash
# Copy env templates for each service
for s in auth-service groups-service status-service notification-service websocket-service; do
  cp packages/$s/.env.example packages/$s/.env.local
done
# Edit each .env.local with your real values
```

### 3. Start infrastructure (Postgres + Redis)
```bash
docker compose up -d postgres redis

# Verify they're healthy
docker compose ps
```

### 4. Run database migrations and seed
```bash
npm run db:generate   # generate Prisma client
npm run db:migrate    # run migrations
npm run db:seed       # seed test data
```

### 5. Start all services
```bash
npm run dev
```

All 5 services start with hot reload. Logs are interleaved in the terminal.

### Or start a single service
```bash
npm run dev -w packages/auth-service
```

## Testing

```bash
# Run all tests
npm test

# Run tests for a specific service
npm test -w packages/auth-service

# Run with coverage
npm test -- --coverage
```

## Linting

```bash
npm run lint
```

## Database

```bash
# Create a new migration
npm run db:migrate -- --name your_migration_name

# Reset database (dev only)
npx prisma migrate reset --schema packages/shared/prisma/schema.prisma

# Open Prisma Studio (database GUI)
npx prisma studio --schema packages/shared/prisma/schema.prisma
```

## Architecture

```
Client (iOS/Android)
        │
        ├── REST API ──▶ AWS ALB ──▶ auth-service     (JWT, OTP, social login)
        │                        ──▶ groups-service   (CRUD, invites)
        │                        ──▶ status-service   (set/get status)
        │                        ──▶ notification-service (device tokens)
        │
        └── WebSocket ──▶ websocket-service ◀── Redis Pub/Sub ◀── status-service
```

## Key product rules (enforced in code)

1. **Push notifications only for Free status.** `maybe` and `busy` changes are silent — they update Redis and broadcast via WebSocket but never trigger push.
2. **Location and vibe only valid with Free status.** The status service rejects location/vibe with 400 if availability ≠ free.
3. **Status expires after 8 hours by default.** Redis TTL auto-removes the key; ghost state is null, not busy.

## Deployment

CI/CD runs via GitHub Actions:
- **PR pipeline**: lint → type check → tests → docker build (no push)
- **Deploy pipeline**: build → push to ECR → deploy staging → smoke test → manual approval → deploy production

See `.github/workflows/` for full pipeline config.

## Project structure

```
avail/
├── packages/
│   ├── shared/                 # Shared types, Prisma schema, constants
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── seed.ts
│   │   └── src/
│   │       └── index.ts        # Exported types and utilities
│   ├── auth-service/
│   ├── groups-service/
│   ├── status-service/
│   ├── notification-service/
│   └── websocket-service/
├── infrastructure/
│   ├── docker/
│   │   └── Dockerfile.service  # Shared multi-stage Dockerfile
│   └── k8s/
│       └── base/               # Kubernetes manifests
├── .github/
│   └── workflows/
│       ├── pr.yml              # PR checks
│       └── deploy.yml          # Deploy to staging + production
├── docker-compose.yml          # Local development
├── package.json                # Workspace root
└── tsconfig.base.json          # Shared TypeScript config
```

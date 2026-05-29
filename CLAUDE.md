# Avail — Project Context for Claude Code

This file gives Claude full context about the Avail project. Read this before helping with any task.

---

## What Avail is

Avail is a social availability app for iOS and Android. It lets friend groups see who is free to hang out in real time — without WhatsApp group chat chaos, without GPS tracking, and without planning overhead.

Users set a status in 2 taps: availability (Free / Maybe / Busy), location intent (My place / The pub / Out and about / Someone's place), and vibe (I'm paying / Buying my own / Suggest something). The moment a status is set, every member of that user's groups sees it instantly via WebSocket and — if the status is Free — gets a push notification.

**Positioning:** Avail is the signal layer. WhatsApp is the coordination layer. No in-app messaging.

---

## App synopsis (share with others)

Avail is a mobile app for iOS and Android that solves a problem every friend group has — knowing who's actually free to hang out without the 40-message WhatsApp thread that goes nowhere.

You create a group with your friends, and whenever you're free you set a status in two taps. Your status has three parts: your availability (free, maybe, or busy), where you want to hang (your place, the pub, out and about, or someone else's), and your vibe (I'm paying, buying my own, or suggest something). The moment you set your status, everyone in your group sees it instantly and gets a push notification.

There's no GPS, no location tracking, and no social feed to scroll. It's purely a signal layer — a low-friction way to let the people you actually want to see know that right now, you're up for it.

---

## Project status

- Phase 1 — Discovery: COMPLETE
- Phase 2 — Design: COMPLETE
- Phase 3 — Backend Dev: IN PROGRESS (infrastructure and CI/CD complete, Auth service next)
- Phase 4 — Frontend Dev: pending
- Phase 5 — Testing: pending
- Phase 6 — Launch: pending

---

## Tech stack

| Layer | Choice | Reason |
|---|---|---|
| Mobile | React Native + TypeScript | Single codebase, iOS + Android |
| Backend | Node.js + TypeScript + Express | Shared types with frontend, ideal for WebSocket workloads |
| API | REST + WebSockets | REST for CRUD, Socket.io for real-time |
| Primary DB | PostgreSQL 16 + Prisma | Relational model, JSONB for status payload |
| Cache + bus | Redis 7 (cache + Pub/Sub) | Live status cache, fan-out across WS pods |
| Real-time | Socket.io + Redis adapter | Room-per-group model |
| Infrastructure | AWS EKS + RDS + ElastiCache | K8s pod scaling |
| Push notifications | Firebase Admin SDK | Abstracts FCM (Android) + APNs (iOS) |
| CI/CD | GitHub Actions | PR pipeline + deploy pipeline with manual approval |
| Monitoring | Datadog | APM, logs, dashboards |
| Error tracking | Sentry | iOS + Android crash reporting |

---

## Monorepo structure

```
avail/
  packages/
    auth-service/        port 3001 — JWT, OTP, Apple/Google sign-in, account deletion
    groups-service/      port 3002 — groups, members, invite links
    status-service/      port 3003 — set/get status, Redis cache, pub/sub fan-out
    notification-service/ port 3004 — push notifications, device tokens
    websocket-service/   port 3005 — Socket.io real-time delivery
    shared/              — Prisma schema, shared TypeScript types, constants
  infrastructure/
    docker/              — shared multi-stage Dockerfile
    k8s/base/            — Kubernetes manifests (Deployments, Services, HPA, Ingress)
  .github/
    workflows/           — pr.yml (lint+test+build) and deploy.yml (ECR+EKS)
  docker-compose.yml     — local dev (postgres + redis + all services)
```

---

## Database schema (PostgreSQL via Prisma)

Six tables: `users`, `groups`, `group_members`, `invite_links`, `statuses`, `device_tokens`, `refresh_tokens`.

Full schema is in `packages/shared/prisma/schema.prisma`.

Key relationships:
- Users belong to many Groups via group_members
- Each GroupMember has one current Status (served from Redis, persisted to DB)
- Status payload: `{ availability, location, vibe, expiresAt }`
- Status expires after 8 hours by default (Redis TTL auto-removes)

---

## Redis keys and channels

```typescript
status:{userId}              // live status cache, TTL = expiresAt
otp:{phone}                  // OTP during sign-up, TTL = 10min
group:{groupId}:status       // Pub/Sub channel — status updates for WS delivery
notifications:push           // Pub/Sub channel — push notification events
```

---

## API conventions

- All routes prefixed: `/v1/`
- Auth: `Authorization: Bearer {accessToken}` header
- JWT: access token 15min expiry, refresh token 30 days
- Content-Type: `application/json`
- Dates: ISO 8601 strings

### Standard error format
```json
{
  "error": {
    "code": "VALIDATION_ERROR | UNAUTHORIZED | FORBIDDEN | NOT_FOUND | CONFLICT | RATE_LIMITED | INTERNAL_ERROR",
    "message": "Human readable description",
    "fields": {}
  }
}
```

---

## Critical product rules — enforce these in code

### 1. Push notifications — Free and Maybe
Push notifications fire when `availability === 'free'` OR `availability === 'maybe'`.
`busy` is a silent update — it updates Redis and broadcasts via WebSocket but NEVER triggers a push notification.

Updated: 20 April 2026. Rationale: Maybe is a soft signal ("I could be persuaded") — receiving a push prompts someone to convert that Maybe into a plan. Busy is not actionable so remains silent.

Enforcement points:
- Status service: check `availability === 'free' || availability === 'maybe'` before publishing to `notifications:push` channel
- Notification service: validate before sending — double check
- The `PushNotificationEvent` type in shared/src/index.ts has `availability: 'free' | 'maybe'` as a literal union to enforce this at compile time

### 2. Status validation — location and vibe only valid with Free
If `availability` is `maybe` or `busy`, `location` and `vibe` must be null.
Return 400 if a request sets location/vibe with a non-free availability.

### 3. Status expiry
Default: 8 hours from time of set. Redis TTL handles auto-expiry.
Ghost state (no status set) is `null` — never show it as Busy.
No expiry push notification in v1.0.

### 4. Confirmation screen copy varies by status
- Free: "Your crew has been notified." (push sent)
- Maybe: "Your crew has been notified." (push sent)
- Busy: "Your status is updated." (no push)

---

## Service communication

Services communicate via:
1. REST API calls — synchronous reads
2. Redis Pub/Sub — async events between services

### Status update flow
```
User sets status via PUT /v1/status
  → Status service validates payload
  → Writes to PostgreSQL
  → Writes to Redis cache (TTL = expiresAt)
  → Publishes to Redis: group:{groupId}:status for each group
  → IF free: publishes to Redis: notifications:push
       → Notification service sends FCM/APNs via Firebase Admin SDK
  → WebSocket service receives from Redis adapter → emits to Socket.io rooms
  → All connected clients in the group receive status:update event
```

---

## User personas

| Persona | Age | Type | Key behaviour |
|---|---|---|---|
| Jamie | 26 | The Coordinator | Opens daily, 3–5 groups, organises everyone, notifications always on |
| Sam | 22 | The Spontaneous One | Opens multiple times/day, sets status impulsively, 1–2 groups |
| Alex | 24 | The Broke Student | Evening user, uses "going cheap" / "buying my own", 2–3 groups |
| Riley | 29 | The Busy Professional | Opens weekly, rare Free status is a big signal, low notifications |

---

## Status variables

**Dimension 1 — Availability (required)**
`free` | `maybe` | `busy`
Only `free` unlocks dimensions 2 and 3. `maybe` and `busy` are single-step flows.

**Dimension 2 — Location (optional, Free only)**
`my_place` | `pub` | `out` | `someones_place`

**Dimension 3 — Vibe (optional, Free only)**
`im_paying` | `buying_own` | `suggest`

---

## Brand

- App name: **Avail**
- Domain target: avail.app or getavail.com
- Primary colour: #FF6B35 (Avail Orange)
- Secondary: #FF9A6C (Soft Coral)
- Accent: #FFD166 (Sun Yellow)
- Dark: #1C1A2E (Deep Plum)
- Background: #F9F7F4 (Warm White)
- Ghost/muted: #C4C1BE (Warm Stone)
- App icon: Ripple collision — warm orange core radiates outward, hits three nodes (friends), each node emits secondary ripple. Deep Plum background.
- Brand voice: Talk like a mate, not a system. "Jamie's free tonight" not "User J. has updated availability status."

---

## Design direction

Minimal layout. Large typography does all the heavy lifting. No nav bars, no card borders, no decoration.

- Home screen: your status first (large, coloured by state), group feed below
- Status picker: full-screen Deep Plum background, 22px bold question text, 3 steps max
- Groups list: active groups full opacity, quiet groups at 45% opacity
- Colour = only status signal: orange = free, yellow = maybe, stone = ghost

---

## MVP scope (v1.0 — 18 features)

**In:** Phone OTP + Apple + Google sign-in, account deletion, create group, invite via deep link, join group, view members, leave group, set availability/location/vibe, auto-expire status (8h), ghost state, push notification for Free only, display name + avatar, edit profile.

**Out of v1.0:** custom status text, status expiry notifications, reactions, in-app messaging, GPS/location tracking, public profiles, group admin tools (v1.1).

**Permanently out:** in-app chat (WhatsApp is the chat layer), GPS tracking (privacy-first positioning).

---

## Cost at scale

| Users | Annual cost | Per user/year |
|---|---|---|
| 10,000 | $6,309 | $0.63 |
| 100,000 | $30,240 | $0.30 |
| 1,000,000 | $214,560 | $0.21 |

Firebase FCM is free up to 10M messages/month. At 1M users (~36M/month) expect ~$15k/year additional.

---

## Current task — Build Auth service

Next to build: `packages/auth-service/`

Endpoints to implement:
- `POST /v1/auth/otp/request` — send OTP via AWS SNS SMS
- `POST /v1/auth/otp/verify` — verify OTP, issue JWT pair
- `POST /v1/auth/social` — Apple or Google sign-in via Firebase Admin
- `POST /v1/auth/refresh` — refresh access token
- `POST /v1/auth/logout` — invalidate refresh token
- `DELETE /v1/auth/account` — soft delete user (App Store requirement)

JWT: RS256, access token 15min, refresh token 30 days stored in DB for revocation.
OTP: 6-digit, Redis TTL 10min, max 5 attempts, rate limit 3 requests/phone/10min.

Full spec in the auth-service ClickUp task comment.

---

## v2.0 future feature (not in current scope)

GPS-based nearby discovery — opt-in, shows other Avail users nearby who are Free. Fuzzy location only (neighbourhood-level). Double opt-in for contact sharing. Requires 50k+ MAU in a city before enabling. Architecture is GPS-ready: PostGIS extension on PostgreSQL, Redis geospatial indexing.

---

## ClickUp project

Project: Avail App folder
6 phase lists, 37 tasks, all with start/due dates set.
Phase 1 (Discovery): complete
Phase 2 (Design): complete
Phase 3 (Backend Dev): in progress — infrastructure task complete

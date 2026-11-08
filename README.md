# VERSYS

Veritas Emergency Response System — Veritas University, Abuja.

First operational target: African Debating Championship, December 2026.

NestJS monorepo root: REST API, realtime, and BullMQ worker.

## Processes

| Process | Entry | Port |
|---------|-------|------|
| REST API | `src/main.api.ts` | 3000 |
| Realtime | `src/main.realtime.ts` | 3001 |
| Worker | `src/main.worker.ts` | — |

## Quick start

```bash
cp .env.example .env
docker compose up -d          # postgres + redis (+ mailpit)
npm install
npm run migration:run
npm run seed                  # roles, places, contacts, demo users
npm run start:api:dev
```

Full stack in Docker (migrate → seed → api / realtime / worker):

```bash
docker compose --profile app up -d --build
# or: npm run docker:app
```

Demo phones (OTP logged in non-prod): `+2348010000001` reporter · `+2348010000002` sheriff · `+2348010000003` dispatcher.

Health: `GET /v1/health` · Ready: `GET /v1/ready` · Swagger: `/docs` · Contract: `docs/openapi.yaml`

E2E (needs Postgres + Redis): `npm run test:e2e`

Delivery plan: see `PHASES.md`.

## Design rules

1. Alert level ≠ staff category ≠ user category — never collapse them.
2. Every channel hits one incident gateway.
3. Escalation logic stays pure in `state-machine/transitions.ts`; services own side effects.
4. `audit_logs` is append-only (DB trigger + application discipline).
5. Location history only during incidents or duty shifts (NDPA).

## Event freeze (Phase 5)

```bash
EVENT_MODE=true
EVENT_NAME="African Debating Championship 2026"
MAINTENANCE_MODE=false   # keep false during the live event
```

Ops snapshot: `GET /v1/ops/status` (JWT). Runbooks: `docs/runbooks/on-call-desk.md`, `paper-radio-protocol.md`.


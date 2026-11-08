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
docker compose up -d
npm install
npm run migration:run
npm run start:api:dev
```

Health: `GET /v1/health` · Ready: `GET /v1/ready` · Swagger: `/docs` · Contract: `docs/openapi.yaml`

Delivery plan: see `PHASES.md`.

## Design rules

1. Alert level ≠ staff category ≠ user category — never collapse them.
2. Every channel hits one incident gateway.
3. Escalation logic stays pure in `state-machine/transitions.ts`; services own side effects.
4. `audit_logs` is append-only (DB trigger + application discipline).
5. Location history only during incidents or duty shifts (NDPA).

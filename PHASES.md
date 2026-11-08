# VERSYS delivery phases

Exit checks are gates — a phase is done when the check passes, not when a date arrives.

## Phase 0 — Foundations *(complete — repo flattened to Versys root)*

**Backend exit**
- [x] Three-process Nest layout (API / realtime / worker)
- [x] Domain model, migration, seeds (+ `npm run seed` runner)
- [x] Permission matrix + escalation transition table with tests
- [x] OpenAPI contract draft (v0.2 — matches shipped routes)
- [x] Local docker-compose (infra + `--profile app` for api/realtime/worker) + CI
- [ ] Front-end blank installs (mobile/web) — parallel track
- [ ] Telecom short-code application started — Back-end B / ops

**Gate:** API contract agreed with front-end; environments boot; blank mobile build installs.

## Phase 1 — Core loop *(backend implemented — confirm gate)*

Auth OTP, incident create, nearest-staff notify, accept/reject, Socket.IO live view, FCM push (mock), location pings.

- [x] OTP request/verify + JWT
- [x] Incident gateway + rate limit + notify target resolution
- [x] Accept / reject with audited reasons
- [x] Socket.IO realtime gateway
- [x] Location ping → Redis GEO + Postgres
- [x] E2E core-loop in CI (Postgres + Redis services)

**Gate:** User raises alert → nearest Level 1 notified → one accepts → dispatcher sees it live.

## Phase 2 — Escalation and communication *(backend implemented — confirm gate)*

Escalation timers + reconciler, resolve rules, audit log, announcements, SMS fallback, alarm/vibration payload, intervention map APIs.

- [x] BullMQ prompt (5m) → auto-escalate (10m) + minute reconciler
- [x] Manual escalate / resolve / Level-4 phone log APIs
- [x] Announcements with category targeting
- [x] FCM alarm/vibrate payload + SMS fallback if no ack
- [x] Intervention map for CAT2/3 + dispatcher

**Gate:** Auto-escalation through levels in a timed test; targeted announcements deliver.

## Phase 3 — Dispatch and insights *(backend implemented on feat/dispatch-insights — confirm gate)*

Dispatcher assignment UX APIs, analytics (response time, route), USSD live, offline queue support.

- [x] Dispatch board / assign / staff roster
- [x] Analytics summary + per-incident route/response time
- [x] USSD session webhook + SMS inbound parser
- [x] Offline alert flush queue (idempotent)

**Gate:** Dispatcher runs a full incident from dashboard; USSD raises an alert end-to-end.

## Phase 4 — Hardening and drills *(backend implemented on feat/hardening — confirm gate)*

Load tests (k6), security review, backup restore, store submission, escalation edge cases.

- [x] Escalation edge-case tests + drill timer env overrides
- [x] Location retention job (NDPA)
- [x] Webhook secret + rate limit on SMS/USSD
- [x] False-alarm review APIs
- [x] k6 scenarios (health burst, socket probe, USSD)
- [x] Backup / restore-verify scripts + security & degraded-network runbooks
- [ ] Live drills on staging (ops) / store submission (mobile track)

**Gate:** Two live drills pass; fallback ladder tested under degraded network.

## Phase 5 — Freeze and event support *(backend ready on feat/event-freeze)*

No new features. On-site desk. Paper/radio protocol ready.

- [x] `EVENT_MODE` / `MAINTENANCE_MODE` config + startup banners
- [x] Maintenance middleware (503 except health/ready) for planned failover only
- [x] Tech-desk `GET /v1/ops/status` (+ health flags)
- [x] On-call desk, paper/radio protocol, event load profile docs
- [ ] Live event staffing & printed packs (ops)

**Gate:** Stable under expected event load; paper/radio protocol understood.

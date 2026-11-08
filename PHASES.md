# VERSYS delivery phases

Exit checks are gates — a phase is done when the check passes, not when a date arrives.

## Phase 0 — Foundations *(complete — repo flattened to Versys root)*

**Backend exit**
- [x] Three-process Nest layout (API / realtime / worker)
- [x] Domain model, migration, seeds
- [x] Permission matrix + escalation transition table with tests
- [x] OpenAPI contract draft
- [x] Local docker-compose + CI
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
- [ ] Live e2e against docker (when daemon available)

**Gate:** User raises alert → nearest Level 1 notified → one accepts → dispatcher sees it live.

## Phase 2 — Escalation and communication

Escalation timers + reconciler, resolve rules, audit log, announcements, SMS fallback, alarm/vibration payload, intervention map APIs.

**Gate:** Auto-escalation through levels in a timed test; targeted announcements deliver.

## Phase 3 — Dispatch and insights

Dispatcher assignment UX APIs, analytics (response time, route), USSD live, offline queue support.

**Gate:** Dispatcher runs a full incident from dashboard; USSD raises an alert end-to-end.

## Phase 4 — Hardening and drills

Load tests (k6), security review, backup restore, store submission, escalation edge cases.

**Gate:** Two live drills pass; fallback ladder tested under degraded network.

## Phase 5 — Freeze and event support

No new features. On-site desk. Paper/radio protocol ready.

**Gate:** Stable under expected event load.

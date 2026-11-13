# On-site tech desk (Phase 5 / event)

## Posture
- `EVENT_MODE=true` — feature freeze; hotfixes only
- `MAINTENANCE_MODE` — **off** during the event (emergency paths must stay live)
- All three processes up: API `:3000`, realtime `:3001`, worker

## Desk kit
- [ ] Laptop with staging + prod kubectl/SSH access
- [ ] Full event ops pack printed (`event-ops-pack.md`)
- [ ] Printed paper/radio protocol (`paper-radio-protocol.md`)
- [ ] Dispatcher hotline number + Level-4 contact list (from `LEVEL4_PHONE_*` / API)
- [ ] Slack/WhatsApp bridge for eng on-call
- [ ] Latest backup timestamp verified (< 24h)

## First checks (every shift start)
1. `GET /v1/health` — `eventMode: true`, `maintenanceMode: false`
2. `GET /v1/ready` — DB + Redis up
3. `GET /v1/ops/status` (JWT) — open incident counts sane
4. Spot-check: raise staging drill alert, accept, resolve
5. Confirm FCM/SMS provider dashboards green

## Severity ladder
| Sev | Example | Action |
|-----|---------|--------|
| SEV-1 | API/DB down, alerts not creating | Failover runbook; paper/radio protocol; page all eng |
| SEV-2 | Push/SMS degraded, realtime flapping | Channel fallback; keep API; fix provider |
| SEV-3 | Analytics/slow queries | Defer until after event unless blocking desk |

## Hotfix rules
- No migrations mid-event unless data-loss risk
- No dependency upgrades
- Cherry-pick only; dual-approve if possible
- Announce in ops channel before and after deploy

## Contacts (fill before event)
- Eng lead: _______________
- Back-end A / B: _______________
- Veritas IT / network: _______________
- Security / dispatcher lead: _______________

# Event ops pack (printable)

Use this pack for live championship posture. Print one set for **dispatcher**, one for **tech desk**, one spare.

## Pack contents

| # | Document | Path |
|---|----------|------|
| 1 | This cover + staffing roster | `event-ops-pack.md` |
| 2 | Paper / radio protocol | `paper-radio-protocol.md` |
| 3 | Drill checklist + sign-off | `drill-checklist.md` |
| 4 | Degraded-network ladder | `degraded-network.md` |
| 5 | On-call desk | `on-call-desk.md` |
| 6 | Event load / freeze checklist | `../event-load-profile.md` |
| 7 | Level-4 contact sheet (filled) | below — from seed / API |

## Level-4 agency phones

Set real E.164 numbers on the host **before** `npm run seed` / deploy seed:

```bash
LEVEL4_PHONE_DSS=+234…
LEVEL4_PHONE_DSS_HUNTERS=+234…
LEVEL4_PHONE_MILITARY=+234…
LEVEL4_PHONE_POLICE=+234…
LEVEL4_PHONE_FIRE_SERVICE=+234…
```

Verify live:

```bash
curl -sS "$API/v1/places/external-contacts" -H "Authorization: Bearer $TOKEN"
```

Seed warns if any `+234800000000*` placeholders remain.

### Printed contact sheet (fill after seed)

| Agency | Key | Phone (E.164) | Verified by | Date |
|--------|-----|---------------|-------------|------|
| DSS | `dss` | | | |
| DSS-Hunters | `dss_hunters` | | | |
| Military | `military` | | | |
| Police | `police` | | | |
| Fire Service | `fire_service` | | | |
| Dispatcher hotline | — | | | |

## Staffing roster (fill before doors)

| Role | Name | Phone | Shift |
|------|------|-------|-------|
| Eng lead | | | |
| Back-end A | | | |
| Back-end B | | | |
| Dispatcher lead | | | |
| Radio net control | | | |
| Muster marshal (zone A) | | | |
| Muster marshal (zone B) | | | |
| Veritas IT / network | | | |
| Security lead | | | |

## Pre-event freeze (doors)

Copy from `event-load-profile.md` — all boxes required:

- [ ] `EVENT_MODE=true`, event name set
- [ ] `MAINTENANCE_MODE=false`
- [ ] Drill timers restored to production defaults
- [ ] Level-4 phones **not** placeholders (`GET /v1/places/external-contacts`)
- [ ] Webhook secret set; edge allowlist live
- [ ] Backup + restore-verify in last 24h
- [ ] Paper/radio packs at dispatcher + muster points
- [ ] On-call desk staffed; contacts filled
- [ ] **Two** drills signed off on staging (`drill-checklist.md`)

## Gate (Phase 10)

Two signed drills + desk briefed on paper/radio protocol → live ops ready.

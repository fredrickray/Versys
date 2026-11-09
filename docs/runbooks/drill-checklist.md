# Drill checklist

Run on **staging** with shortened escalation timers. Complete **two** full passes (different days or shifts) before Phase 10 gate.

## Medical drill
- [ ] App alert (accident/medical) → nearest CAT1 notified
- [ ] Responder accepts; dispatcher sees live on board + realtime
- [ ] Location pings appear on intervention map (CAT2/3)
- [ ] Resolve path (CAT2 close or confirm → final)

## Fire drill
- [ ] Fire alert starts at Level 2
- [ ] Muster guidance / muster points listed
- [ ] Escalate path exercised (manual or shortened auto timers)
- [ ] Level-3 freeze verified (no further auto-escalate)
- [ ] Level-4 phone log exercised with a **test** agency number (no real agency call unless authorized)

## Fallback ladder
- [ ] See `degraded-network.md` — all five layers

## Timers (staging)
- [ ] `ESCALATION_PROMPT_AFTER_MS` / `ESCALATION_AUTO_AFTER_PROMPT_MS` shortened
- [ ] Reconciler recovers a deliberately dropped delayed job

## Ops
- [ ] Paper/radio protocol printed and briefed (`paper-radio-protocol.md`)
- [ ] Backup restore verify run in last 7 days
- [ ] False-alarm review glance after drill spam
- [ ] Level-4 contact sheet printed from live `external-contacts` (see `event-ops-pack.md`)

## Sign-off (need two)

| Pass | Date | Lead | Medical | Fire | Ladder | Notes | Signature |
|------|------|------|---------|------|--------|-------|-----------|
| 1 | | | ☐ | ☐ | ☐ | | |
| 2 | | | ☐ | ☐ | ☐ | | |

Restore production escalation timers after the last drill.

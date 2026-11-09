# Expected event load (African Debating Championship)

Tune k6 and infra against this profile; revise after first drill.

| Signal | Expected peak | Notes |
|--------|---------------|-------|
| Concurrent app users | 500–2,000 | Guests + staff |
| Alert creates / hour | < 50 steady; burst 20/min in drill | Rate limit 10/user/hour |
| Socket.IO connections | ≈ concurrent staff dashboards + responders | Scale realtime process first |
| Location pings / min | Responders × ~4 | Only on duty / assigned |
| USSD/SMS | Fallback — low volume | Webhook rate limit 60/min/IP |
| Announcements | Rare, broadcast | Prefer targeted categories |

## Freeze checklist before doors open
- [ ] `EVENT_MODE=true`, event name set
- [ ] `MAINTENANCE_MODE=false`
- [ ] Drill timers restored to production defaults (or confirmed)
- [ ] Level-4 phones real (not `+234800000000*` placeholders)
- [ ] Webhook secret set; Caddy/WAF allowlist live
- [ ] Backup + restore-verify in last 24h
- [ ] Paper/radio packs at dispatcher + muster points (`event-ops-pack.md`)
- [ ] On-call desk staffed; contacts filled
- [ ] Two staging drills signed off (`drill-checklist.md`)

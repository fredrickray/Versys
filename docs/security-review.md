# Security review checklist (Phase 4)

## Auth & access
- [ ] JWT secrets ≥ 32 chars, distinct access/refresh, rotated for prod
- [ ] OTP throttle active (30s) and codes never logged in production
- [ ] Permission matrix enforced on dispatch, analytics, escalate, Level-4
- [ ] Swagger disabled (or auth-gated) in production

## Channels
- [ ] `CHANNEL_WEBHOOK_SECRET` set for SMS/USSD aggregators
- [ ] Webhook rate limit tuned (`RATE_LIMIT_WEBHOOKS_PER_MINUTE`)
- [ ] Aggregator IPs allowlisted at Caddy / cloud WAF

## Data (NDPA 2023)
- [ ] Location pings only during incident/duty (enforced in LocationService)
- [ ] Nightly retention job active (`LOCATION_RETENTION_DAYS`)
- [ ] Audit log append-only trigger verified after restore
- [ ] False-alarm review process exercised (`GET /v1/audit/false-alarms`)

## Ops
- [ ] Backup restore verified with `scripts/restore-verify.sh`
- [ ] k6 alert-burst + ussd-session thresholds green on staging
- [ ] Helmet + CORS origins locked to real clients

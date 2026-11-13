# Security review checklist (Phase 4)

## Auth & access
- [ ] JWT secrets ≥ 32 chars, distinct access/refresh, rotated for prod
- [ ] OTP throttle active (30s) and codes never logged in production
- [ ] Permission matrix enforced on dispatch, analytics, escalate, Level-4
- [ ] Swagger disabled (or auth-gated) in production

## Channels
- [ ] `CHANNEL_SIMULATOR_ONLY=true` and `SMS_PROVIDER=mock` until a provider-specific signed-body contract is approved
- [ ] `CHANNEL_WEBHOOK_SECRET` is at least 32 characters in staging/production
- [ ] Webhook rate limit tuned (`RATE_LIMIT_WEBHOOKS_PER_MINUTE`)
- [ ] Live provider signature, timestamp, nonce, and raw-body verification reviewed before simulator mode is disabled
- [ ] Provider IPs allowlisted at Caddy / cloud WAF as a supplemental control

## Data (NDPA 2023)
- [ ] Location pings only during incident/duty (enforced in LocationService)
- [ ] Nightly retention job active (`LOCATION_RETENTION_DAYS`)
- [ ] Audit log append-only trigger verified after restore
- [ ] False-alarm review process exercised (`GET /v1/audit/false-alarms`)

## Ops
- [ ] Backup restore verified with `scripts/restore-verify.sh`
- [ ] k6 alert-burst + ussd-session thresholds green on staging
- [ ] Helmet + CORS origins locked to real clients

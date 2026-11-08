# Failover

1. Promote standby Postgres (or cloud failover).
2. Point `DATABASE_HOST` at the new primary; rolling restart API → realtime → worker.
3. If Redis is lost: nearest-staff falls back to last-known Postgres pings until GEO warms.
4. Confirm Caddy routes and FCM/SMS provider health.
5. Log the event in the ops channel; open an incident review.

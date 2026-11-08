# Restore backup

1. Put API/realtime/worker into maintenance (stop workers first).
2. Restore Postgres from the latest base backup + WAL.
3. Verify `SELECT postgis_version();` and row counts on `incidents`, `audit_logs`.
4. Flush Redis only if GEO keys are known-stale; otherwise let live pings rebuild.
5. Run `/v1/ready`, then a single drill alert on staging.

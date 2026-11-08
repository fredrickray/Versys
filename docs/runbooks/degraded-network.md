# Degraded-network fallback ladder drill

Simulate each layer; record pass/fail and clock time.

1. **Slow data** — throttle client to ~2G; raise app alert; confirm tiny retry (<1 KB) succeeds.
2. **No data** — disable mobile data/Wi‑Fi; confirm pre-filled SMS path (or inbound SMS webhook).
3. **Feature phone** — dial USSD short code; complete type → group → place → confirm; SMS ack with `publicCode`.
4. **Digital down** — stop API containers; confirm dispatcher hotline + paper log protocol.
5. **Full outage** — radios + printed muster/roles cards; no digital dependency.

Exit: all five steps exercised once in staging before event freeze (Phase 5).

# USSD flow

Sessions live in Redis (~2 min TTL). Each screen ≤ ~160 characters.

1. Dial short code
2. Menu 1 — type: Fire / Fight / Medical / Crime / Other
3. Menu 2 — location group: Hostels / Faculties / Halls & Chapel / Sports & Gate
4. Menu 3 — numbered place from `places` seed
5. Confirm → incident gateway creates record → SMS with `publicCode`

No GPS on USSD: place selection is mandatory.

Telecom: short code + sender ID via aggregator. Start application early (open decision #2).

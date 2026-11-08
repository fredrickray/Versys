# Permission matrix

Three independent axes. Do not collapse them in code or UI.

| Axis | Values | Purpose |
|------|--------|---------|
| Alert level | 1–4 | Who gets notified |
| Staff category | CAT 1–3 | What a staff member may do |
| User category | management, FRT, security, … | Announcement targeting |

## Staff capabilities

| Capability | CAT 1 | CAT 2 | CAT 3 |
|------------|:-----:|:-----:|:-----:|
| Read messages | ✓ | ✓ | ✓ |
| View muster / nav maps | ✓ | ✓ | ✓ |
| Accept / reject intervention | ✓ | ✓ | ✓ |
| Confirm or escalate (assigned) | ✓ | ✓ | ✓ |
| Final close | | ✓ | ✓ |
| Monitor intervention map | | ✓ | ✓ |
| Push announcements (own subcats) | | ✓ | ✓ |
| Push announcements (any) | | | ✓ |
| View analytics | | | ✓ |
| Level-4 escalate (phone log) | | | ✓ |

Dispatcher overlay: assign, monitor map, close after 1h, Level-4 log, analytics.

## Closure rule (spec §4.2)

Assigned responders (any CAT) may confirm/escalate. Final `resolved` requires CAT 2/3, or dispatcher after 1 hour. Open decision #4 until client confirms.

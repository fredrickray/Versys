# Paper and radio backup protocol

Use when digital systems are unavailable or deliberately frozen for failover.

## Roles
- **Dispatcher (paper)** — owns the incident log book
- **Radio net control** — assigns channels; repeats critical traffic
- **Muster marshals** — account for zones; report headcount to net control
- **Runner** — physical message between desks if radio fails

## Incident log (paper) — one row per alert
| Time | Location | Type | Reporter | Assigned to | Status | Notes |
|------|----------|------|----------|-------------|--------|-------|

Public code format when digital is down: `P-HHMM-##` (paper, time, sequence).

## Radio brevity
1. Identify: "Net control, this is Marshal Hostel A"
2. State: "Fire smell, Block B stairwell, requesting Level 2"
3. Wait for acknowledgment and assignment
4. Update: "Intervention ongoing" / "Resolved" / "Escalate Level 3"

## Escalation without the app
- Level 1 → radio nearest sheriff / hostel admin
- Level 2 → commander / medical / deputy dean on net
- Level 3 → Dean / management via net control phone tree
- Level 4 → dispatcher places recorded phone call from printed contact list

## Muster (fire)
- Move to nearest unblocked muster point (printed map)
- Marshal reports headcount + missing persons to net control
- Do not re-enter until net control clears

## After digital returns
1. Dispatcher enters paper incidents into VERSYS with channel `dispatcher_phone`
2. Attach paper public codes in metadata
3. File paper log with security office

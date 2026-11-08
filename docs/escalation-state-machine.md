# Escalation state machine

Source of truth for behaviour: `src/modules/escalation/state-machine/transitions.ts`.

```
assignment.accepted
        │
        ▼
   [wait 5 min] ──► prompt_due ──► promptIssuedAt set
                          │
                          ├─ confirm → close_final (CAT2/3) or hold
                          ├─ manual_escalate → next level (< ULTRA)
                          └─ [wait 10 min unanswered]
                                    │
                                    ▼
                              auto_escalate
                                    │
                     level < 3 ─────┴───── level ≥ 3 → FROZEN
                                    │
                                    ▼
                              notify next tier
                                    │
                     Level 4 ──► record_level4 (phone call + audit)
```

Timers (ms constants in `ESCALATION_TIMERS`):

- Prompt after assignment: 5 minutes
- Auto-escalate after unanswered prompt: 10 minutes
- Dispatcher electronic resolve: 1 hour from assignment clock
- Reconciler: every 60 seconds (safety net against lost jobs)

Assumption pending client sign-off: the 10-minute window starts when the prompt is **issued**, not when it is dismissed.

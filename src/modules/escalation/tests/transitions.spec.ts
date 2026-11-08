import { ESCALATION_TIMERS } from '../../../common/constants/escalation';
import {
  AlertLevel,
  IncidentStatus,
  StaffCategory,
} from '../../../common/enums';
import {
  evaluateTransition,
  nextAlertLevel,
  type EscalationContext,
} from '../state-machine/transitions';

const baseActor = {
  staffCategory: StaffCategory.CAT_1,
  isDispatcher: false,
  isAssignedResponder: true,
};

function ctx(partial: Partial<EscalationContext> = {}): EscalationContext {
  const now = partial.now ?? new Date('2026-12-01T12:00:00.000Z');
  return {
    status: IncidentStatus.INTERVENTION_ONGOING,
    alertLevel: AlertLevel.LOW,
    assignedAt: new Date(now.getTime() - ESCALATION_TIMERS.PROMPT_AFTER_MS),
    promptIssuedAt: null,
    actor: { ...baseActor },
    now,
    ...partial,
    actor: { ...baseActor, ...(partial.actor ?? {}) },
  };
}

describe('escalation transitions', () => {
  it('advances alert levels in order and stops before ULTRA for auto path', () => {
    expect(nextAlertLevel(AlertLevel.LOW)).toBe(AlertLevel.MID);
    expect(nextAlertLevel(AlertLevel.MID)).toBe(AlertLevel.HIGH);
    expect(nextAlertLevel(AlertLevel.HIGH)).toBe(AlertLevel.ULTRA);
    expect(nextAlertLevel(AlertLevel.ULTRA)).toBeNull();
  });

  it('issues prompt only after 5 minutes and only once', () => {
    const now = new Date('2026-12-01T12:00:00.000Z');
    expect(
      evaluateTransition(
        'prompt_due',
        ctx({
          now,
          assignedAt: new Date(
            now.getTime() - ESCALATION_TIMERS.PROMPT_AFTER_MS + 1,
          ),
        }),
      ).ok,
    ).toBe(false);

    expect(evaluateTransition('prompt_due', ctx({ now })).ok).toBe(true);
    expect(
      evaluateTransition(
        'prompt_due',
        ctx({ now, promptIssuedAt: new Date(now.getTime() - 1000) }),
      ),
    ).toEqual({ ok: false, reason: 'prompt_already_issued' });
  });

  it('auto-escalates 10 minutes after unanswered prompt and freezes at level 3', () => {
    const now = new Date('2026-12-01T12:00:00.000Z');
    const promptIssuedAt = new Date(
      now.getTime() - ESCALATION_TIMERS.AUTO_ESCALATE_AFTER_PROMPT_MS,
    );

    expect(
      evaluateTransition(
        'auto_escalate',
        ctx({ now, promptIssuedAt, alertLevel: AlertLevel.LOW }),
      ),
    ).toEqual({ ok: true, nextLevel: AlertLevel.MID });

    expect(
      evaluateTransition(
        'auto_escalate',
        ctx({ now, promptIssuedAt, alertLevel: AlertLevel.HIGH }),
      ),
    ).toMatchObject({
      ok: false,
      reason: 'auto_escalation_frozen',
      freeze: true,
    });
  });

  it('blocks CAT1 from final close and allows CAT2', () => {
    expect(
      evaluateTransition(
        'close_final',
        ctx({ actor: { ...baseActor, staffCategory: StaffCategory.CAT_1 } }),
      ).ok,
    ).toBe(false);

    expect(
      evaluateTransition(
        'close_final',
        ctx({
          actor: {
            staffCategory: StaffCategory.CAT_2,
            isDispatcher: false,
            isAssignedResponder: true,
          },
        }),
      ),
    ).toEqual({ ok: true, nextStatus: IncidentStatus.RESOLVED });
  });

  it('allows dispatcher resolve only after 1 hour', () => {
    const now = new Date('2026-12-01T12:00:00.000Z');
    const actor = {
      staffCategory: null as StaffCategory | null,
      isDispatcher: true,
      isAssignedResponder: false,
    };

    expect(
      evaluateTransition(
        'dispatcher_resolve',
        ctx({
          now,
          actor,
          assignedAt: new Date(
            now.getTime() -
              ESCALATION_TIMERS.DISPATCHER_RESOLVE_AFTER_MS +
              1000,
          ),
        }),
      ).ok,
    ).toBe(false);

    expect(
      evaluateTransition(
        'dispatcher_resolve',
        ctx({
          now,
          actor,
          assignedAt: new Date(
            now.getTime() - ESCALATION_TIMERS.DISPATCHER_RESOLVE_AFTER_MS,
          ),
        }),
      ),
    ).toEqual({ ok: true, nextStatus: IncidentStatus.RESOLVED });
  });

  it('routes level-4 to recorded phone-call path', () => {
    expect(
      evaluateTransition(
        'manual_escalate',
        ctx({
          alertLevel: AlertLevel.HIGH,
          actor: {
            staffCategory: StaffCategory.CAT_3,
            isDispatcher: false,
            isAssignedResponder: false,
          },
        }),
      ),
    ).toEqual({ ok: false, reason: 'use_record_level4' });

    expect(
      evaluateTransition(
        'record_level4',
        ctx({
          alertLevel: AlertLevel.HIGH,
          actor: {
            staffCategory: StaffCategory.CAT_3,
            isDispatcher: false,
            isAssignedResponder: false,
          },
        }),
      ),
    ).toEqual({ ok: true, nextLevel: AlertLevel.ULTRA });
  });
});

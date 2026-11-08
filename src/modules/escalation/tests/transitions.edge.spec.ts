import {
  ESCALATION_TIMERS,
  resolveEscalationTimers,
} from '../../../common/constants/escalation';
import {
  AlertLevel,
  IncidentStatus,
  StaffCategory,
} from '../../../common/enums';
import {
  canAutoEscalate,
  evaluateTransition,
  type EscalationContext,
} from '../state-machine/transitions';

const responder = {
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
    actor: { ...responder },
    now,
    ...partial,
    actor: { ...responder, ...(partial.actor ?? {}) },
  };
}

describe('escalation edge cases', () => {
  it('rejects every action once resolved', () => {
    const resolved = ctx({ status: IncidentStatus.RESOLVED });
    for (const action of [
      'prompt_due',
      'confirm_resolved',
      'close_final',
      'manual_escalate',
      'auto_escalate',
      'record_level4',
      'dispatcher_resolve',
    ] as const) {
      expect(evaluateTransition(action, resolved).ok).toBe(false);
    }
  });

  it('auto-escalates MID → HIGH then freezes', () => {
    const now = new Date('2026-12-01T12:00:00.000Z');
    const promptIssuedAt = new Date(
      now.getTime() - ESCALATION_TIMERS.AUTO_ESCALATE_AFTER_PROMPT_MS,
    );
    expect(
      evaluateTransition(
        'auto_escalate',
        ctx({ now, promptIssuedAt, alertLevel: AlertLevel.MID }),
      ),
    ).toEqual({ ok: true, nextLevel: AlertLevel.HIGH });
    expect(canAutoEscalate(AlertLevel.HIGH)).toBe(false);
  });

  it('blocks auto-escalate before prompt and before 10 minutes', () => {
    const now = new Date('2026-12-01T12:00:00.000Z');
    expect(evaluateTransition('auto_escalate', ctx({ now })).ok).toBe(false);
    expect(
      evaluateTransition(
        'auto_escalate',
        ctx({
          now,
          promptIssuedAt: new Date(now.getTime() - 1000),
        }),
      ).ok,
    ).toBe(false);
  });

  it('blocks confirm for unassigned non-dispatcher', () => {
    expect(
      evaluateTransition(
        'confirm_resolved',
        ctx({
          actor: {
            staffCategory: StaffCategory.CAT_2,
            isDispatcher: false,
            isAssignedResponder: false,
          },
        }),
      ),
    ).toEqual({ ok: false, reason: 'not_assigned_responder' });
  });

  it('allows CAT3 final close without being assignee', () => {
    expect(
      evaluateTransition(
        'close_final',
        ctx({
          actor: {
            staffCategory: StaffCategory.CAT_3,
            isDispatcher: false,
            isAssignedResponder: false,
          },
        }),
      ),
    ).toEqual({ ok: true, nextStatus: IncidentStatus.RESOLVED });
  });

  it('blocks level-4 for CAT1/CAT2', () => {
    expect(
      evaluateTransition(
        'record_level4',
        ctx({
          actor: {
            staffCategory: StaffCategory.CAT_1,
            isDispatcher: false,
            isAssignedResponder: true,
          },
        }),
      ).ok,
    ).toBe(false);
  });

  it('honours shortened drill timers', () => {
    const timers = resolveEscalationTimers({
      PROMPT_AFTER_MS: 1_000,
      AUTO_ESCALATE_AFTER_PROMPT_MS: 2_000,
    });
    const now = new Date('2026-12-01T12:00:00.000Z');
    expect(
      evaluateTransition(
        'prompt_due',
        ctx({
          now,
          timers,
          assignedAt: new Date(now.getTime() - 1_000),
        }),
      ).ok,
    ).toBe(true);
    expect(
      evaluateTransition(
        'auto_escalate',
        ctx({
          now,
          timers,
          promptIssuedAt: new Date(now.getTime() - 2_000),
        }),
      ),
    ).toEqual({ ok: true, nextLevel: AlertLevel.MID });
  });
});

import {
  AUTO_ESCALATION_CEILING,
  ESCALATION_TIMERS,
  type EscalationTimers,
} from '../../../common/constants/escalation';
import {
  AlertLevel,
  IncidentStatus,
  StaffCategory,
} from '../../../common/enums';

export type EscalationAction =
  | 'prompt_due'
  | 'confirm_resolved'
  | 'manual_escalate'
  | 'auto_escalate'
  | 'record_level4'
  | 'dispatcher_resolve'
  | 'close_final';

export type EscalationContext = {
  status: IncidentStatus;
  alertLevel: AlertLevel;
  assignedAt: Date | null;
  promptIssuedAt: Date | null;
  actor: {
    staffCategory: StaffCategory | number | null;
    isDispatcher: boolean;
    /** True when the actor holds an active accepted assignment on this incident */
    isAssignedResponder: boolean;
  };
  now: Date;
  /** Optional timer overrides (drills / staging). Defaults to ESCALATION_TIMERS. */
  timers?: EscalationTimers;
};

export type TransitionResult =
  | {
      ok: true;
      nextLevel?: AlertLevel;
      nextStatus?: IncidentStatus;
      freeze?: boolean;
    }
  | { ok: false; reason: string; freeze?: boolean };

const LEVEL_ORDER: AlertLevel[] = [
  AlertLevel.LOW,
  AlertLevel.MID,
  AlertLevel.HIGH,
  AlertLevel.ULTRA,
];

export function nextAlertLevel(current: AlertLevel): AlertLevel | null {
  const idx = LEVEL_ORDER.indexOf(current);
  if (idx < 0 || idx >= LEVEL_ORDER.length - 1) return null;
  return LEVEL_ORDER[idx + 1];
}

export function canAutoEscalate(level: AlertLevel): boolean {
  return level < AUTO_ESCALATION_CEILING; // HIGH(3) and above freeze
}

function msSince(from: Date | null, now: Date): number | null {
  if (!from) return null;
  return now.getTime() - from.getTime();
}

/**
 * Pure transition table. Side effects (jobs, notifications, audit) live in EscalationService.
 */
export function evaluateTransition(
  action: EscalationAction,
  ctx: EscalationContext,
): TransitionResult {
  const timers = ctx.timers ?? ESCALATION_TIMERS;

  if (ctx.status === IncidentStatus.RESOLVED) {
    return { ok: false, reason: 'incident_already_resolved' };
  }

  switch (action) {
    case 'prompt_due': {
      if (!ctx.assignedAt) {
        return { ok: false, reason: 'no_active_assignment' };
      }
      const age = msSince(ctx.assignedAt, ctx.now);
      if (age == null || age < timers.PROMPT_AFTER_MS) {
        return { ok: false, reason: 'prompt_not_due' };
      }
      if (ctx.promptIssuedAt) {
        return { ok: false, reason: 'prompt_already_issued' };
      }
      return { ok: true };
    }

    case 'confirm_resolved': {
      if (!ctx.actor.isAssignedResponder && !ctx.actor.isDispatcher) {
        return { ok: false, reason: 'not_assigned_responder' };
      }
      return { ok: true, nextStatus: IncidentStatus.INTERVENTION_ONGOING };
    }

    case 'close_final': {
      const cat = ctx.actor.staffCategory;
      const catAllowed =
        cat === StaffCategory.CAT_2 || cat === StaffCategory.CAT_3;
      if (catAllowed) {
        return { ok: true, nextStatus: IncidentStatus.RESOLVED };
      }
      if (ctx.actor.isDispatcher) {
        return evaluateTransition('dispatcher_resolve', ctx);
      }
      return { ok: false, reason: 'insufficient_category_for_close' };
    }

    case 'dispatcher_resolve': {
      if (!ctx.actor.isDispatcher) {
        return { ok: false, reason: 'dispatcher_only' };
      }
      if (!ctx.assignedAt) {
        return { ok: false, reason: 'no_assignment_clock' };
      }
      const age = msSince(ctx.assignedAt, ctx.now);
      if (age == null || age < timers.DISPATCHER_RESOLVE_AFTER_MS) {
        return { ok: false, reason: 'dispatcher_resolve_too_early' };
      }
      return { ok: true, nextStatus: IncidentStatus.RESOLVED };
    }

    case 'manual_escalate': {
      if (
        !ctx.actor.isAssignedResponder &&
        !ctx.actor.isDispatcher &&
        ctx.actor.staffCategory !== StaffCategory.CAT_3
      ) {
        return { ok: false, reason: 'cannot_manual_escalate' };
      }
      const next = nextAlertLevel(ctx.alertLevel);
      if (!next) {
        return { ok: false, reason: 'already_at_max_level' };
      }
      if (next === AlertLevel.ULTRA) {
        return { ok: false, reason: 'use_record_level4' };
      }
      return { ok: true, nextLevel: next };
    }

    case 'auto_escalate': {
      if (!canAutoEscalate(ctx.alertLevel)) {
        return { ok: false, reason: 'auto_escalation_frozen', freeze: true };
      }
      if (!ctx.promptIssuedAt) {
        return { ok: false, reason: 'prompt_not_issued' };
      }
      const sincePrompt = msSince(ctx.promptIssuedAt, ctx.now);
      if (
        sincePrompt == null ||
        sincePrompt < timers.AUTO_ESCALATE_AFTER_PROMPT_MS
      ) {
        return { ok: false, reason: 'auto_escalate_not_due' };
      }
      const next = nextAlertLevel(ctx.alertLevel);
      if (!next || next === AlertLevel.ULTRA) {
        return { ok: false, reason: 'auto_escalation_frozen', freeze: true };
      }
      return { ok: true, nextLevel: next };
    }

    case 'record_level4': {
      const allowed =
        ctx.actor.isDispatcher ||
        ctx.actor.staffCategory === StaffCategory.CAT_3;
      if (!allowed) {
        return { ok: false, reason: 'level4_requires_dispatcher_or_cat3' };
      }
      return { ok: true, nextLevel: AlertLevel.ULTRA };
    }

    default: {
      const _exhaustive: never = action;
      void _exhaustive;
      return { ok: false, reason: 'unknown_action' };
    }
  }
}

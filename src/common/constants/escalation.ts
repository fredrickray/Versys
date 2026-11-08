import { AlertLevel } from '../enums';

export type EscalationTimers = {
  PROMPT_AFTER_MS: number;
  AUTO_ESCALATE_AFTER_PROMPT_MS: number;
  DISPATCHER_RESOLVE_AFTER_MS: number;
  RECONCILER_INTERVAL_MS: number;
};

/**
 * Default escalation timer policy (spec §5.3).
 * Staging/drills may override via env — see resolveEscalationTimers().
 */
export const ESCALATION_TIMERS: EscalationTimers = {
  PROMPT_AFTER_MS: 5 * 60 * 1000,
  AUTO_ESCALATE_AFTER_PROMPT_MS: 10 * 60 * 1000,
  DISPATCHER_RESOLVE_AFTER_MS: 60 * 60 * 1000,
  RECONCILER_INTERVAL_MS: 60 * 1000,
};

/** Highest alert level that still auto-escalates. Level 3 freezes. */
export const AUTO_ESCALATION_CEILING = AlertLevel.HIGH;

export function resolveEscalationTimers(
  overrides: Partial<EscalationTimers> = {},
): EscalationTimers {
  return {
    PROMPT_AFTER_MS:
      overrides.PROMPT_AFTER_MS ?? ESCALATION_TIMERS.PROMPT_AFTER_MS,
    AUTO_ESCALATE_AFTER_PROMPT_MS:
      overrides.AUTO_ESCALATE_AFTER_PROMPT_MS ??
      ESCALATION_TIMERS.AUTO_ESCALATE_AFTER_PROMPT_MS,
    DISPATCHER_RESOLVE_AFTER_MS:
      overrides.DISPATCHER_RESOLVE_AFTER_MS ??
      ESCALATION_TIMERS.DISPATCHER_RESOLVE_AFTER_MS,
    RECONCILER_INTERVAL_MS:
      overrides.RECONCILER_INTERVAL_MS ??
      ESCALATION_TIMERS.RECONCILER_INTERVAL_MS,
  };
}

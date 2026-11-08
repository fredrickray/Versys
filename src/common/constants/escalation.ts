import { AlertLevel } from '../enums';

/**
 * Escalation timer policy (spec §5.3).
 * Durations are milliseconds so BullMQ delay APIs consume them directly.
 *
 * Confirmed assumption (open decision #4 until client signs off):
 * the 10-minute auto-escalate window starts when the 5-minute prompt is issued,
 * not when the responder dismisses it.
 */
export const ESCALATION_TIMERS = {
  /** After assignment accepted → prompt "resolved or escalate?" */
  PROMPT_AFTER_MS: 5 * 60 * 1000,
  /** After prompt issued with no answer → auto-escalate */
  AUTO_ESCALATE_AFTER_PROMPT_MS: 10 * 60 * 1000,
  /** Dispatcher may electronically resolve after this age */
  DISPATCHER_RESOLVE_AFTER_MS: 60 * 60 * 1000,
  /** Safety-net reconciler cadence */
  RECONCILER_INTERVAL_MS: 60 * 1000,
} as const;

/** Highest alert level that still auto-escalates. Level 3 freezes. */
export const AUTO_ESCALATION_CEILING = AlertLevel.HIGH;

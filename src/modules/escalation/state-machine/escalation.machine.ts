import {
  evaluateTransition,
  type EscalationAction,
  type EscalationContext,
} from './transitions';

/** Thin façade so services depend on one import surface. */
export class EscalationMachine {
  evaluate(action: EscalationAction, ctx: EscalationContext) {
    return evaluateTransition(action, ctx);
  }
}

import { Injectable } from '@nestjs/common';
import { EscalationMachine } from './state-machine/escalation.machine';
import type {
  EscalationAction,
  EscalationContext,
} from './state-machine/transitions';

@Injectable()
export class EscalationService {
  constructor(private readonly machine: EscalationMachine) {}

  evaluate(action: EscalationAction, ctx: EscalationContext) {
    return this.machine.evaluate(action, ctx);
  }
}

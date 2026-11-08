/** Termii / most NG aggregators want digits only (no +). */
export function toAggregatorMsisdn(e164: string): string {
  return e164.replace(/\D/g, '');
}

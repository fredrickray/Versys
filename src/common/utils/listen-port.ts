/**
 * Instacloud (and most PaaS) inject PORT for the routed health-check port.
 * Prefer that when set; otherwise fall back to the process-specific default.
 */
export function resolveListenPort(fallback: number): number {
  const fromEnv = Number(process.env.PORT);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return fromEnv;
  }
  return fallback;
}

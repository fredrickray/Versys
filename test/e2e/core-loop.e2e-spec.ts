/**
 * Phase 1 gate: alert → notify → accept → dispatcher sees it.
 * Full harness needs Postgres + Redis; marked todo until docker is available in CI e2e job.
 */
describe('core-loop (Phase 1)', () => {
  it.todo(
    'raises an alert, notifies nearest Level 1, accepts, dispatcher observes',
  );
});

import { isHealthPath, shouldBlockForMaintenance } from './maintenance.policy';

describe('maintenance policy', () => {
  it('never blocks when maintenance is off', () => {
    expect(shouldBlockForMaintenance(false, '/v1/incidents')).toBe(false);
  });

  it('allows health and ready during maintenance', () => {
    expect(isHealthPath('/v1/health')).toBe(true);
    expect(isHealthPath('/v1/ready')).toBe(true);
    expect(shouldBlockForMaintenance(true, '/v1/health')).toBe(false);
    expect(shouldBlockForMaintenance(true, '/v1/ready')).toBe(false);
  });

  it('blocks emergency API routes only when maintenance is on', () => {
    expect(shouldBlockForMaintenance(true, '/v1/incidents')).toBe(true);
    expect(shouldBlockForMaintenance(true, '/v1/channels/ussd/session')).toBe(
      true,
    );
  });
});

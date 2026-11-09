import {
  isPlaceholderLevel4Phone,
  resolveExternalContactSeeds,
} from './external-contacts.seed';

describe('resolveExternalContactSeeds', () => {
  it('uses placeholders when LEVEL4_PHONE_* unset', () => {
    const rows = resolveExternalContactSeeds({});
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.isPlaceholder && !r.fromEnv)).toBe(true);
    expect(isPlaceholderLevel4Phone(rows[0]!.phoneE164)).toBe(true);
  });

  it('overrides phones from env', () => {
    const rows = resolveExternalContactSeeds({
      LEVEL4_PHONE_DSS: '+2347011111111',
      LEVEL4_PHONE_POLICE: '  +2347022222222  ',
    });
    const dss = rows.find((r) => r.key === 'dss');
    const police = rows.find((r) => r.key === 'police');
    const fire = rows.find((r) => r.key === 'fire_service');

    expect(dss).toMatchObject({
      phoneE164: '+2347011111111',
      fromEnv: true,
      isPlaceholder: false,
    });
    expect(police).toMatchObject({
      phoneE164: '+2347022222222',
      fromEnv: true,
      isPlaceholder: false,
    });
    expect(fire?.isPlaceholder).toBe(true);
    expect(fire?.fromEnv).toBe(false);
  });
});

/** Placeholder E.164s — never dial; replace via LEVEL4_PHONE_* env before live ops. */
export const PLACEHOLDER_LEVEL4_PREFIX = '+234800000000';

type ExternalContactSeed = {
  key: string;
  agencyName: string;
  phoneE164: string;
  /** Env var that overrides phoneE164 when set (non-empty). */
  phoneEnv: string;
};

const BASE_EXTERNAL_CONTACTS: readonly ExternalContactSeed[] = [
  {
    key: 'dss',
    agencyName: 'DSS',
    phoneE164: `${PLACEHOLDER_LEVEL4_PREFIX}1`,
    phoneEnv: 'LEVEL4_PHONE_DSS',
  },
  {
    key: 'dss_hunters',
    agencyName: 'DSS-Hunters',
    phoneE164: `${PLACEHOLDER_LEVEL4_PREFIX}2`,
    phoneEnv: 'LEVEL4_PHONE_DSS_HUNTERS',
  },
  {
    key: 'military',
    agencyName: 'Military',
    phoneE164: `${PLACEHOLDER_LEVEL4_PREFIX}3`,
    phoneEnv: 'LEVEL4_PHONE_MILITARY',
  },
  {
    key: 'police',
    agencyName: 'Police',
    phoneE164: `${PLACEHOLDER_LEVEL4_PREFIX}4`,
    phoneEnv: 'LEVEL4_PHONE_POLICE',
  },
  {
    key: 'fire_service',
    agencyName: 'Fire Service',
    phoneE164: `${PLACEHOLDER_LEVEL4_PREFIX}5`,
    phoneEnv: 'LEVEL4_PHONE_FIRE_SERVICE',
  },
] as const;

export type ResolvedExternalContact = {
  key: string;
  agencyName: string;
  phoneE164: string;
  fromEnv: boolean;
  isPlaceholder: boolean;
};

export function isPlaceholderLevel4Phone(phoneE164: string): boolean {
  return phoneE164.startsWith(PLACEHOLDER_LEVEL4_PREFIX);
}

/** Resolve Level-4 contacts; env wins over seed defaults when set. */
export function resolveExternalContactSeeds(
  env: NodeJS.ProcessEnv = process.env,
): ResolvedExternalContact[] {
  return BASE_EXTERNAL_CONTACTS.map((seed) => {
    const raw = env[seed.phoneEnv]?.trim();
    const phoneE164 = raw && raw.length > 0 ? raw : seed.phoneE164;
    return {
      key: seed.key,
      agencyName: seed.agencyName,
      phoneE164,
      fromEnv: Boolean(raw),
      isPlaceholder: isPlaceholderLevel4Phone(phoneE164),
    };
  });
}

import { IncidentType } from '../../../common/enums';

export type ParsedSmsAlert = {
  type: IncidentType;
  placeCode: string;
  raw: string;
};

/**
 * Keyword grammar: "<TYPE> <PLACE_CODE>" e.g. "FIRE HOSTEL_A", "MED MED", "CRIME MAIN_GATE"
 */
const TYPE_KEYWORDS: Array<{ match: RegExp; type: IncidentType }> = [
  { match: /^(FIRE|FR)\b/i, type: IncidentType.FIRE },
  { match: /^(FIGHT|FT)\b/i, type: IncidentType.FIGHT },
  { match: /^(MED|MEDICAL|ACCIDENT)\b/i, type: IncidentType.ACCIDENT },
  { match: /^(CRIME|CR)\b/i, type: IncidentType.ONGOING_CRIME },
  { match: /^(INVASION|INV)\b/i, type: IncidentType.INVASION },
  { match: /^(ATTACK|VA)\b/i, type: IncidentType.VIOLENT_ATTACK },
  { match: /^(SUS|SUSPICIOUS)\b/i, type: IncidentType.SUSPICIOUS_MOVEMENT },
];

export function parseInboundSms(body: string): ParsedSmsAlert | null {
  const cleaned = body.trim().replace(/\s+/g, ' ');
  if (!cleaned) return null;

  for (const entry of TYPE_KEYWORDS) {
    const m = cleaned.match(entry.match);
    if (!m) continue;
    const rest = cleaned.slice(m[0].length).trim();
    if (!rest) return null;
    const placeCode = rest
      .toUpperCase()
      .replace(/\s+/g, '_')
      .replace(/-/g, '_');
    return { type: entry.type, placeCode, raw: cleaned };
  }

  return null;
}

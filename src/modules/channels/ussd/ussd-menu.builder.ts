import { USSD_LOCATION_GROUPS } from '../../places/places.service';
import type { PlaceEntity } from '../../places/entities/place.entity';

/** Keep each screen ~160 chars for USSD session limits. */
export function truncateUssd(text: string, max = 160): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export function buildTypeMenu(): string {
  return truncateUssd(
    'VERSYS\n1.Fire\n2.Fight\n3.Medical\n4.Crime\n5.Other\n0.Cancel',
  );
}

export function buildGroupMenu(): string {
  const lines = USSD_LOCATION_GROUPS.map((g) => `${g.ussdNumber}.${g.label}`);
  return truncateUssd(`Location:\n${lines.join('\n')}\n0.Back`);
}

export function buildPlaceMenu(places: PlaceEntity[]): string {
  const lines = places
    .slice(0, 9)
    .map((p) => `${p.ussdNumber}.${p.name.replace(/^Hostel /, 'H')}`);
  return truncateUssd(`Place:\n${lines.join('\n')}\n0.Back`);
}

export function buildConfirmMenu(typeLabel: string, placeName: string): string {
  return truncateUssd(`Confirm ${typeLabel} @ ${placeName}?\n1.Yes\n0.No`);
}

import { randomInt } from 'crypto';

/** Short human-facing incident code for SMS/USSD (e.g. VR-4F2A). */
export function generatePublicCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let body = '';
  for (let i = 0; i < 4; i++) {
    body += alphabet[randomInt(alphabet.length)];
  }
  return `VR-${body}`;
}

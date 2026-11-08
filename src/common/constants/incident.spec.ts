import { AlertLevel, IncidentType } from '../enums';
import { initialAlertLevel } from './incident';

describe('initialAlertLevel', () => {
  it('starts fire at mid (level 2)', () => {
    expect(initialAlertLevel(IncidentType.FIRE)).toBe(AlertLevel.MID);
  });

  it('defaults other types to low', () => {
    expect(initialAlertLevel(IncidentType.FIGHT)).toBe(AlertLevel.LOW);
  });
});

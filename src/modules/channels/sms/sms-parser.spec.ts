import { IncidentType } from '../../../common/enums';
import { parseInboundSms } from './sms-parser';

describe('parseInboundSms', () => {
  it('parses FIRE HOSTEL_A', () => {
    expect(parseInboundSms('FIRE HOSTEL_A')).toEqual({
      type: IncidentType.FIRE,
      placeCode: 'HOSTEL_A',
      raw: 'FIRE HOSTEL_A',
    });
  });

  it('parses MED MED (medical type @ Medical Faculty)', () => {
    expect(parseInboundSms('MED MED')).toEqual({
      type: IncidentType.ACCIDENT,
      placeCode: 'MED',
      raw: 'MED MED',
    });
  });

  it('rejects empty / unknown', () => {
    expect(parseInboundSms('')).toBeNull();
    expect(parseInboundSms('HELLO THERE')).toBeNull();
  });
});

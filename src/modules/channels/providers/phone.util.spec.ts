import { toAggregatorMsisdn } from './phone.util';

describe('toAggregatorMsisdn', () => {
  it('strips plus and non-digits', () => {
    expect(toAggregatorMsisdn('+2348012345678')).toBe('2348012345678');
    expect(toAggregatorMsisdn('234-801-234-5678')).toBe('2348012345678');
  });
});

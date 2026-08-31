import { sanitizeAuditDetails } from './audit';

describe('client audit detail hygiene', () => {
  it('retains bounded operational values and drops PII, credentials, and objects', () => {
    expect(sanitizeAuditDetails({
      attempted_action: 'invoice.read',
      email: 'customer@example.test',
      access_token: 'secret',
      phone_number: '2155550100',
      nested: { authorization: 'secret' },
      'bad key': 'ignored',
      count: 2,
      note: 'x'.repeat(600),
    })).toEqual({
      attempted_action: 'invoice.read',
      count: 2,
      note: 'x'.repeat(512),
    });
  });
});

import { createLoanSchema, requestOtpSchema, verifyOtpSchema } from '../src/validation';

describe('phone validation', () => {
  it('strips spaces and dashes', () => {
    expect(requestOtpSchema.parse({ phone: ' +91 98765-43210 ' }).phone).toBe('+919876543210');
  });
  it.each(['12345', 'abcdefghij', '+0123456789', ''])('rejects %p', (phone) => {
    expect(requestOtpSchema.safeParse({ phone }).success).toBe(false);
  });
});

describe('otp validation', () => {
  it('accepts exactly 6 digits', () => {
    expect(verifyOtpSchema.safeParse({ phone: '9876543210', otp: '123456' }).success).toBe(true);
  });
  it.each(['12345', '1234567', 'abcdef', ''])('rejects %p', (otp) => {
    expect(verifyOtpSchema.safeParse({ phone: '9876543210', otp }).success).toBe(false);
  });
});

describe('loan validation', () => {
  const good = { friendName: ' Asha ', amount: '250.50', dueDate: '2030-02-28' };

  it('coerces multipart strings and trims the name', () => {
    expect(createLoanSchema.parse(good)).toEqual({
      friendName: 'Asha',
      amount: 250.5,
      dueDate: '2030-02-28',
    });
  });

  it.each([
    ['empty name', { friendName: '   ' }],
    ['zero amount', { amount: 0 }],
    ['negative amount', { amount: -10 }],
    ['non-numeric amount', { amount: 'abc' }],
    ['3 decimal places', { amount: '10.123' }],
    ['bad date format', { dueDate: '28/02/2030' }],
    ['impossible date', { dueDate: '2025-02-30' }],
  ])('rejects %s', (_label, override) => {
    expect(createLoanSchema.safeParse({ ...good, ...override }).success).toBe(false);
  });
});

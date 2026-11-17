import { describe, expect, it } from 'vitest';
import { maskName, maskOrderNumber } from '../src/common/utils/mask.js';
import { multiplyMoney, subtractMoney, sumMoney } from '../src/common/utils/money.js';
import { normalizeCustomerPhone } from '../src/common/utils/phone.js';

describe('Laundry Core Utilities Baseline', () => {
  it('menghitung uang dengan presisi 2 desimal', () => {
    expect(multiplyMoney(3.5, 7000)).toBe(24500);
    expect(sumMoney([10000.25, 5000.75])).toBe(15001);
    expect(subtractMoney(20000, 12500)).toBe(7500);
  });

  it('menormalisasi nomor HP customer 11-13 digit', () => {
    expect(normalizeCustomerPhone('08123456789')).toBe('628123456789');
    expect(normalizeCustomerPhone('081234567')).toBeNull();
  });

  it('melakukan masking nama & nomor nota untuk tracking publik', () => {
    expect(maskName('Budi Santoso')).toBe('Bu** Sa*****');
    expect(maskOrderNumber('LDR-261104-7KQ2MZ')).toBe('LDR-261104-****MZ');
  });
});

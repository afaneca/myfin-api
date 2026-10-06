import { describe, expect, test } from 'vitest';
import {
  directionTotal,
  moneyInCents,
  normalizeItems,
} from '../../src/services/budgetAllocationService.js';

describe('budget breakdown currency and totals', () => {
  test('sums fractional currency exactly and permits zero', () => {
    const items = normalizeItems([
      { label: ' A ', amount: 0.1 },
      { label: 'B', amount: '0.20' },
      { label: 'Buffer', amount: 0 },
    ]);
    expect(directionTotal(0n, undefined, items, [])).toBe(30n);
    expect(items[0]).toEqual({ label: 'A', amount: 10n, sort_order: 0 });
  });
  test.each([
    -1,
    '1.001',
    Number.NaN,
    Number.POSITIVE_INFINITY,
    '1e3',
    '',
    null,
    '90071992547409.92',
    '90071992547409.91',
  ])('rejects invalid currency %s', (amount) => {
    expect(() => moneyInCents(amount)).toThrow();
  });
  test.each([
    { label: ' ', amount: 0 },
    { label: 'a'.repeat(256), amount: 0 },
    { label: 'A', amount: 0, sort_order: -1 },
    { label: 'A', amount: 0, direction: 'INVALID' },
  ])('rejects invalid items', (item) => {
    expect(() => normalizeItems([item])).toThrow();
  });
  test('preserves omitted items, accepts unchanged older totals, rejects conflicts', () => {
    expect(directionTotal(30n, '0.30', undefined, [{ amount: 30n }])).toBe(30n);
    expect(() => directionTotal(30n, 1, undefined, [{ amount: 30n }])).toThrow();
    expect(directionTotal(30n, '0.30', [{ amount: 40n }], [])).toBe(40n);
    expect(() => directionTotal(30n, 1, [{ amount: 40n }], [])).toThrow();
  });
  test('clearing items retains the total unless a replacement is supplied', () => {
    expect(directionTotal(30n, undefined, [], [{ amount: 30n }])).toBe(30n);
    expect(directionTotal(30n, 1, [], [{ amount: 30n }])).toBe(100n);
    expect(directionTotal(30n, 1, undefined, [])).toBe(100n);
  });
});

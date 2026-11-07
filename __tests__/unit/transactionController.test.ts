import { afterEach, describe, expect, test, vi } from 'vitest';
import CommonsController from '../../src/controllers/commonsController.js';
import TransactionController from '../../src/controllers/transactionController.js';
import TransactionService from '../../src/services/transactionService.js';

const authenticate = () =>
  vi
    .spyOn(CommonsController, 'checkAuthSessionValidity')
    .mockResolvedValue({ userId: 1n } as never);

async function request(query: Record<string, string>) {
  const send = vi.fn();
  const next = vi.fn();
  await TransactionController.getFilteredTrxByPage({ query, params: { page: 0 } }, { send }, next);
  return { send, next };
}

afterEach(() => vi.restoreAllMocks());

describe('transaction month filters', () => {
  test('forwards the validated month and year with pagination and search', async () => {
    authenticate();
    const service = vi
      .spyOn(TransactionService, 'getFilteredTransactionsByForUser')
      .mockResolvedValue({ results: [], filtered_count: 0, total_count: 0 });
    const { next, send } = await request({
      month: '12',
      year: '2025',
      page_size: '2',
      query: 'groceries',
    });
    expect(service).toHaveBeenCalledWith(1n, 0, 2, 'groceries', 12, 2025);
    expect(next).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledOnce();
  });

  test('keeps existing unfiltered requests working', async () => {
    authenticate();
    const service = vi
      .spyOn(TransactionService, 'getFilteredTransactionsByForUser')
      .mockResolvedValue({ results: [], filtered_count: 0, total_count: 0 });
    const { next } = await request({});
    expect(service).toHaveBeenCalledWith(1n, 0, expect.any(Number), '', undefined, undefined);
    expect(next).not.toHaveBeenCalled();
  });

  test.each([
    { month: '12' },
    { year: '2025' },
    { month: '0', year: '2025' },
    { month: '13', year: '2025' },
    { month: '1.5', year: '2025' },
    { month: '2', year: 'invalid' },
  ])('rejects invalid or incomplete month filters: %j', async (query) => {
    authenticate();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const service = vi.spyOn(TransactionService, 'getFilteredTransactionsByForUser');
    const { next } = await request(query);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(service).not.toHaveBeenCalled();
  });
});

import { beforeEach } from 'vitest';
import { mockDeep, mockReset } from 'vitest-mock-extended';
import type { PrismaClient } from '../../src/generated/prisma/client.js';

beforeEach(() => {
  mockReset(mockedPrisma);
});

export const mockedPrisma = mockDeep<PrismaClient>();

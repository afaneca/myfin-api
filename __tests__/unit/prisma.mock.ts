import type { PrismaClient } from '@prisma/client';
import { beforeEach } from 'vitest';
import { mockDeep, mockReset } from 'vitest-mock-extended';

beforeEach(() => {
  mockReset(mockedPrisma);
});

export const mockedPrisma = mockDeep<PrismaClient>();

import { afterAll, afterEach, beforeEach, vi } from 'vitest';
import { prisma } from '../../../src/config/prisma.js';
import resetDb from './resetDb.js';

afterEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

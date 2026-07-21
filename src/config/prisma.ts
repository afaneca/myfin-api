import { fileURLToPath } from 'node:url';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '../generated/prisma/client.js';
import Logger from '../utils/Logger.js';
import { resolveDatabaseUrl } from './databaseUrl.js';

loadEnv({
  path: fileURLToPath(new URL('../../.env', import.meta.url)),
  quiet: true,
});

// Fix for BigInt not being serializable
// eslint-disable-next-line no-extend-native
// @ts-expect-error expected
BigInt.prototype.toJSON = function () {
  const int = Number.parseInt(this.toString(), 10);
  return int || this.toString();
};

const databaseUrl =
  resolveDatabaseUrl() ??
  (process.env.NODE_ENV === 'test' ? 'mysql://unused:unused@localhost:3306/unused' : undefined);

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to initialize Prisma.');
}

const adapter = new PrismaMariaDb(databaseUrl);

export const prisma = new PrismaClient({
  adapter,
  /* log: ["query"] */
});

export type DatabaseRequestConfig = {
  maxWait?: number;
  timeout?: number;
};

export const performDatabaseRequest = async <T>(
  transactionBody: (prismaTx: PrismaClient) => T | Promise<T>,
  prismaClient: PrismaClient = undefined,
  transactionConfig: DatabaseRequestConfig = undefined
): Promise<T> => {
  if (!prismaClient) {
    return prisma.$transaction(async (prismaTx) => {
      return transactionBody(prismaTx as PrismaClient);
    }, transactionConfig);
  }
  return transactionBody(prismaClient);
};

export default {
  prisma,
  setupPrismaTransaction: performDatabaseRequest,
};

import { describe, expect, test } from 'vitest';
import { resolveDatabaseUrl } from '../../src/config/databaseUrl.js';

describe('resolveDatabaseUrl', () => {
  test('keeps an explicit resolved URL unchanged', () => {
    const url = 'mysql://user:password@database:3306/myfin';
    expect(resolveDatabaseUrl({ DATABASE_URL: url })).toBe(url);
  });

  test('expands the existing VPS dotenv placeholders', () => {
    expect(
      resolveDatabaseUrl({
        DATABASE_URL: 'mysql://${DB_USER}:${DB_PW}@localhost:${DB_PORT}/${DB_TABLE}?schema=public',
        DB_TABLE: 'tony_myfin',
        DB_USER: 'tony_myfin',
        DB_PW: 'p:a/ss#word%',
        DB_PORT: '3306',
      })
    ).toBe('mysql://tony_myfin:p%3Aa%2Fss%23word%25@localhost:3306/tony_myfin?schema=public');
  });

  test('builds and encodes a URL from separate database variables', () => {
    expect(
      resolveDatabaseUrl({
        DB_NAME: 'my finances',
        DB_USER: 'user@example.com',
        DB_PW: 'p:a/ss#word%',
        DB_HOST: 'database',
        DB_PORT: '3306',
      })
    ).toBe('mysql://user%40example.com:p%3Aa%2Fss%23word%25@database:3306/my%20finances');
  });

  test('supports DB_TABLE as the legacy database-name variable', () => {
    expect(
      resolveDatabaseUrl({
        DB_TABLE: 'myfin',
        DB_USER: 'user',
        DB_PW: 'password',
        DB_HOST: 'localhost',
      })
    ).toBe('mysql://user:password@localhost:3306/myfin');
  });

  test('returns undefined when no database configuration is present', () => {
    expect(resolveDatabaseUrl({})).toBeUndefined();
  });

  test('rejects an invalid port before Prisma receives the URL', () => {
    expect(() =>
      resolveDatabaseUrl({
        DB_TABLE: 'myfin',
        DB_USER: 'user',
        DB_PW: 'password',
        DB_HOST: 'localhost',
        DB_PORT: '${DB_PORT}',
      })
    ).toThrow('DB_PORT must be a number between 1 and 65535.');
  });
});

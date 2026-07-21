import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';
import { resolveDatabaseUrl } from './src/config/databaseUrl.js';

loadEnv({ path: fileURLToPath(new URL('.env', import.meta.url)), quiet: true });

const databaseUrl = resolveDatabaseUrl();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: databaseUrl
    ? {
        url: databaseUrl,
      }
    : undefined,
});

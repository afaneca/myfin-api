import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import { resolveDatabaseUrl } from './src/config/databaseUrl.js';

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

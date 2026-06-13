import { createRequire } from 'node:module';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { buildOpenApiDocument, registerSwagger } from './docs/openApi.js';
import { apiErrorHandler, headerInjector, i18n, rateLimiter } from './middlewares/index.js';
import router from './routes/router.js';
import Logger from './utils/Logger.js';
const require = createRequire(import.meta.url);
const { version } = require('../package.json');
const swaggerDocument = await buildOpenApiDocument(version);

const app = express();
if (process.env.NODE_ENV == "development") {
  registerSwagger(app, swaggerDocument);

}

app.use(rateLimiter(app));
app.use(cors());
app.use(helmet());
app.use(i18n.middleware());
app.use(headerInjector);

// payload size exception for /user/restore endpoint
app.use('/user/restore', express.json({ limit: '100mb' }));
app.use(
  '/user/restore',
  express.urlencoded({
    extended: true,
    limit: '100mb',
  })
);
// set global json setup
app.use('/', express.json());
app.use(
  '/',
  express.urlencoded({
    extended: true,
  })
);

app.get('/', (request, response) => {
  response.json({ info: 'MyFin API', version: version });
});

router(app);
app.use(apiErrorHandler);

export default app;

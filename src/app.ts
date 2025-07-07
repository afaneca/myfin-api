import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import router from './routes/router.js';
import { rateLimiter, apiErrorHandler, i18n } from "./middlewares/index.js";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { version } = require("../package.json");

const app = express();

app.use(rateLimiter);
app.use(cors());
app.use(helmet());
app.use(i18n.middleware());

// payload size exception for /user/restore endpoint
app.use("/user/restore", express.json({ limit: '100mb' }));
app.use("/user/restore",
  express.urlencoded({
    extended: true,
    limit: '100mb'
  })
);
// set global json setup
app.use("/", express.json());
app.use("/",
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

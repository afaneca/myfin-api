import 'dotenv/config.js';
import app from './app.js';
import DemoAccountScheduler from './utils/demoAccountScheduler.js';

// Set UTC as default timezone
process.env.TZ = 'Etc/UTC';

const PORT = process.env.PORT || 3001;
DemoAccountScheduler.start();
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`MyFin server listening on port ${PORT}`);
});

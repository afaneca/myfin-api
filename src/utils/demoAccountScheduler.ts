import UserService from '../services/userService.js';
import DateTimeUtils from './DateTimeUtils.js';
import Logger from './Logger.js';

const THREE_AM_HOUR = 3;

let demoResetTimeout: ReturnType<typeof setTimeout> | null = null;

const getNextRunDelayMs = (now = new Date()) => {
  const nextRun = new Date(now);
  nextRun.setHours(THREE_AM_HOUR, 0, 0, 0);

  if (nextRun <= now) {
    nextRun.setDate(nextRun.getDate() + 1);
  }

  return nextRun.getTime() - now.getTime();
};

const resetDemoAccounts = async () => {
  const demoUserIds = await UserService.getAllDemoUserIds();

  if (!demoUserIds.length) {
    Logger.addLog('Demo account reset skipped: no demo users found.');
    return;
  }

  for (const userId of demoUserIds) {
    await UserService.autoPopulateDemoData(userId);
  }

  Logger.addLog(
    `Demo account reset finished for ${demoUserIds.length} account(s) at ${DateTimeUtils.getCurrentUnixTimestamp()}.`
  );
};

const scheduleNextRun = (delayMs: number) => {
  demoResetTimeout = setTimeout(async () => {
    try {
      await resetDemoAccounts();
    } catch (err) {
      Logger.addStringifiedLog(err, true);
    } finally {
      scheduleNextRun(getNextRunDelayMs());
    }
  }, delayMs);
};

const start = () => {
  if (demoResetTimeout) {
    return;
  }

  const initialDelayMs = getNextRunDelayMs();
  Logger.addLog(`Demo account reset scheduled to run in ${initialDelayMs}ms.`);
  scheduleNextRun(initialDelayMs);
};

const stop = () => {
  if (!demoResetTimeout) {
    return;
  }

  clearTimeout(demoResetTimeout);
  demoResetTimeout = null;
};

export default {
  getNextRunDelayMs,
  resetDemoAccounts,
  start,
  stop,
};

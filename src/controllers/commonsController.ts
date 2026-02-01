import type { Request } from 'express';
import APIError from '../errorHandling/apiError.js';
import userService from '../services/userService.js';
import Logger from '../utils/Logger.js';
import SessionManager from '../utils/sessionManager.js';

/**
 *
 * @param req
 * @param renewTrustLimit
 * @returns {Promise<{mobile: boolean, userId: number, key, username}>}
 */

const checkAuthSessionValidity = async (req: Request, renewTrustLimit = true) => {
  const userCount = await userService.getUserCount();
  if (userCount == 0) throw APIError.notFound('No registered users were found.');

  const bypassSessionChecking = process.env.BYPASS_SESSION_CHECK === 'true';
  /*Logger.addLog(`bypass: ${process.env.BYPASS_SESSION_CHECK}`);*/

  const sessionkey: string = req.get('sessionkey');
  const username: string = req.get('authusername');
  const mobile: boolean = req.get('mobile') === 'true';
  const userId: bigint = await userService.getUserIdFromUsername(username);

  if (
    !(
      !bypassSessionChecking &&
      (await SessionManager.checkIfSessionKeyIsValid(sessionkey, username, renewTrustLimit, mobile))
    )
  ) {
    throw APIError.notAuthorized();
  }
  return {
    sessionkey,
    username,
    mobile,
    userId,
  };
};

export default { checkAuthSessionValidity };

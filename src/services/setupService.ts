import { performDatabaseRequest, prisma } from "../config/prisma.js";
import userService from "./userService.js";
import APIError from "../errorHandling/apiError.js";

const initInstance = async(
  username: string,
  password: string,
  email: string,
  currency: string,
  dbClient = undefined
) => performDatabaseRequest(async (prismaTx) => {
  const userCount = await userService.getUserCount();
  // We should only allow access to this functionality if no users have been registered yet
  if(userCount != 0) throw APIError.notAcceptable()

  return userService.createUser({username, password, email, currency}, prismaTx);
}, dbClient);

export default {
  initInstance,
}
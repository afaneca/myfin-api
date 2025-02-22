import { afterAll, beforeAll, expect, test, describe, beforeEach, afterEach } from "vitest";
import UserService from "../../src/services/userService.js";
import { expectThrowErrorCode } from "./utils/testUtils.js";
import resetDb from "./utils/resetDb.js";

describe("User tests", () => {
  beforeEach(async () => {
    await UserService.createUser({
      username: "demo",
      password: "123",
      email: "demo@afaneca.com"
    });
  });

  describe("auth", async () => {
    test("Login should be successful when given correct credentials", async () => {
      const result = await UserService.attemptLogin("demo", "123", false);
      expect(result).toHaveProperty('username')
      expect(result.username).toBe('demo')
    });

    test("Login should be unsuccessful when given incorrect credentials", async () => {
      await expectThrowErrorCode(() => UserService.attemptLogin("demo", "1234", false), 401);
    });

  })
})
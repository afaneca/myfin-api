import { expect } from "vitest";
import APIError from "../../../src/errorHandling/apiError.js";

export const expectThrowErrorCode = async (assertion: () => Promise<any>, expectedCode: number) => {
  await expect(assertion()).rejects.toSatisfy((e) => {
    expect(e).toBeInstanceOf(APIError);
    expect(e.code).toBe(expectedCode);
    return true;
  });
};

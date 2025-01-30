import { beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import { PrismaClient } from "@prisma/client";

beforeEach(() => {
  mockReset(mockedPrisma)
})

export const mockedPrisma = mockDeep<PrismaClient>()

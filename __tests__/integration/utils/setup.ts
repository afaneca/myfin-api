import { afterAll, afterEach, beforeEach, vi } from "vitest";
import resetDb from "./resetDb.js";
import { prisma } from "../../../src/config/prisma.js";

afterEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

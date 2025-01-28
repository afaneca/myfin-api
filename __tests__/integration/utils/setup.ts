import { afterAll, afterEach } from "vitest";
import resetDb from "./resetDb.js";
import { prisma } from "../../../src/config/prisma.js";

afterEach(async () => {
  console.log("-------------------- RESET DB")
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

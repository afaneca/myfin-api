import { prisma } from "../../../src/config/prisma.js";

export default async () => {
  await prisma.$transaction([
    prisma.transaction_has_tags.deleteMany(),
    prisma.balances_snapshot.deleteMany(),
    prisma.budgets_has_categories.deleteMany(),
    prisma.invest_asset_evo_snapshot.deleteMany(),
    prisma.invest_desired_allocations.deleteMany(),
    prisma.invest_transactions.deleteMany(),
    prisma.invest_assets.deleteMany(),
    prisma.rules.deleteMany(),
    prisma.tags.deleteMany(),
    prisma.categories.deleteMany(),
    prisma.entities.deleteMany(),
    prisma.budgets.deleteMany(),
    prisma.transactions.deleteMany(),
    prisma.accounts.deleteMany(),
    prisma.otp_codes.deleteMany(),
    prisma.users.deleteMany()
  ])
}
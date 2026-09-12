import { prisma } from '../config/prisma.js';
import InvestAssetService from '../services/investAssetService.js';

const requestedUsername = process.argv[2];

const users = await prisma.users.findMany({
  where: requestedUsername ? { username: requestedUsername } : undefined,
  select: { user_id: true, username: true },
  orderBy: { username: 'asc' },
});

if (requestedUsername && users.length === 0) {
  throw new Error(`Unknown user: ${requestedUsername}`);
}

let issueCount = 0;

for (const user of users) {
  const stats = await InvestAssetService.getAssetStatsForUser(user.user_id);
  const snapshots = stats.monthly_snapshots;
  const issues = snapshots
    .filter((snapshot) => snapshot.validation_status !== 'valid')
    .map((snapshot) => ({
      asset_id: snapshot.asset_id.toString(),
      asset_name: snapshot.asset_name,
      ticker: snapshot.asset_ticker,
      month: snapshot.month,
      year: snapshot.year,
      units: Number(snapshot.units),
      invested_amount: Number(snapshot.invested_amount),
      current_value: Number(snapshot.current_value),
      valuation_source: snapshot.valuation_source,
      validation_status: snapshot.validation_status,
      validation_reasons: snapshot.validation_reasons,
    }));

  issueCount += issues.length;
  const yearlyPortfolioReturns = Object.fromEntries(
    Object.entries(stats.return_metrics.by_year).map(([year, metrics]) => [
      year,
      {
        percentage: metrics.portfolio_return.cumulative_percentage,
        status: metrics.portfolio_return.status,
      },
    ])
  );

  console.log(
    JSON.stringify(
      {
        username: user.username,
        portfolio: {
          current_value: stats.total_current_value,
          currently_invested: stats.total_currently_invested_value,
          absolute_return: stats.global_roi_value,
          simple_roi_percentage: stats.global_roi_percentage,
          portfolio_return: stats.return_metrics.global.portfolio_return,
          yearly_portfolio_returns: yearlyPortfolioReturns,
        },
        issues,
      },
      null,
      2
    )
  );
}

console.log(`Investment snapshot audit completed: ${issueCount} issue(s).`);
await prisma.$disconnect();

import { MYFIN } from '../consts.js';
import { Prisma } from '../generated/prisma/client.js';

export const yearlyTransactionOwnershipFilter = (userId?: bigint) => {
  if (userId === undefined) return Prisma.empty;

  // Match the debit account for expenses, the credit account for income, and both for transfers.
  return Prisma.sql`AND EXISTS (
    SELECT 1
    FROM accounts AS owner_account
    WHERE owner_account.users_user_id = ${userId}
      AND owner_account.account_id = CASE
        WHEN transactions.type = ${MYFIN.TRX_TYPES.INCOME} THEN transactions.accounts_account_to_id
        ELSE transactions.accounts_account_from_id
      END
  )
  AND (
    transactions.type <> ${MYFIN.TRX_TYPES.TRANSFER}
    OR EXISTS (
      SELECT 1
      FROM accounts AS destination_account
      WHERE destination_account.users_user_id = ${userId}
        AND destination_account.account_id = transactions.accounts_account_to_id
    )
  )`;
};

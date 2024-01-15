-- DropIndex
DROP INDEX `fk_transactions_accounts1_idx` ON `transactions`;

-- CreateIndex
CREATE INDEX `fk_transactions_accounts1_idx` ON `transactions`(`accounts_account_from_id`, `accounts_account_to_id`);

-- CreateIndex
CREATE INDEX `transactions_accounts_account_to_id_index` ON `transactions`(`accounts_account_to_id`);

-- AddForeignKey
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_accounts_account_id_fk` FOREIGN KEY (`accounts_account_to_id`) REFERENCES `accounts`(`account_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_accounts_account_id_fk2` FOREIGN KEY (`accounts_account_from_id`) REFERENCES `accounts`(`account_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

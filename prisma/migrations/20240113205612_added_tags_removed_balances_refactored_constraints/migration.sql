/*
  Warnings:

  - You are about to drop the `balances` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE `balances`;

-- CreateTable
CREATE TABLE `tags` (
    `tag_id` BIGINT NOT NULL AUTO_INCREMENT,
    `description` LONGTEXT NULL,
    `name` VARCHAR(255) NOT NULL,
    `users_user_id` BIGINT NOT NULL,

    UNIQUE INDEX `uq_name`(`name`),
    INDEX `fk_users_user_id`(`users_user_id`),
    PRIMARY KEY (`tag_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `transaction_has_tags` (
    `transactions_transaction_id` BIGINT NOT NULL,
    `tags_tag_id` BIGINT NOT NULL,

    INDEX `transaction_has_tags_transactions_transaction_id_fk`(`transactions_transaction_id`),
    PRIMARY KEY (`tags_tag_id`, `transactions_transaction_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `budgets_has_categories_users_user_id_fk` ON `budgets_has_categories`(`budgets_users_user_id`);

-- AddForeignKey
ALTER TABLE `accounts` ADD CONSTRAINT `accounts_users_user_id_fk` FOREIGN KEY (`users_user_id`) REFERENCES `users`(`user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `balances_snapshot` ADD CONSTRAINT `balances_snapshot_accounts_account_id_fk` FOREIGN KEY (`accounts_account_id`) REFERENCES `accounts`(`account_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `budgets` ADD CONSTRAINT `budgets_users_user_id_fk` FOREIGN KEY (`users_user_id`) REFERENCES `users`(`user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `budgets_has_categories` ADD CONSTRAINT `budgets_has_categories_budgets_budget_id_fk` FOREIGN KEY (`budgets_budget_id`) REFERENCES `budgets`(`budget_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `budgets_has_categories` ADD CONSTRAINT `budgets_has_categories_categories_category_id_fk` FOREIGN KEY (`categories_category_id`) REFERENCES `categories`(`category_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `budgets_has_categories` ADD CONSTRAINT `budgets_has_categories_users_user_id_fk` FOREIGN KEY (`budgets_users_user_id`) REFERENCES `users`(`user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `categories` ADD CONSTRAINT `categories_users_user_id_fk` FOREIGN KEY (`users_user_id`) REFERENCES `users`(`user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `entities` ADD CONSTRAINT `entities_users_user_id_fk` FOREIGN KEY (`users_user_id`) REFERENCES `users`(`user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `invest_asset_evo_snapshot` ADD CONSTRAINT `invest_asset_evo_snapshot_invest_assets_asset_id_fk` FOREIGN KEY (`invest_assets_asset_id`) REFERENCES `invest_assets`(`asset_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `invest_desired_allocations` ADD CONSTRAINT `invest_desired_allocations_users_user_id_fk` FOREIGN KEY (`users_user_id`) REFERENCES `users`(`user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `invest_transactions` ADD CONSTRAINT `invest_transactions_invest_assets_asset_id_fk` FOREIGN KEY (`invest_assets_asset_id`) REFERENCES `invest_assets`(`asset_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `rules` ADD CONSTRAINT `rules_users_user_id_fk` FOREIGN KEY (`users_user_id`) REFERENCES `users`(`user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `tags` ADD CONSTRAINT `fk_users_user_id` FOREIGN KEY (`users_user_id`) REFERENCES `users`(`user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `transaction_has_tags` ADD CONSTRAINT `transaction_has_tags_tags_tag_id_fk` FOREIGN KEY (`tags_tag_id`) REFERENCES `tags`(`tag_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `transaction_has_tags` ADD CONSTRAINT `transaction_has_tags_transactions_transaction_id_fk` FOREIGN KEY (`transactions_transaction_id`) REFERENCES `transactions`(`transaction_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;
